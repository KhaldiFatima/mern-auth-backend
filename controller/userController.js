const asyncHandler = require('express-async-handler');
// const bcrypt = require('bcryptjs');
const User = require('../models/user');
const Token = require('../models/token');

const { generateToken, hashToken } = require('../utils/index');
var parser = require('ua-parser-js');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');
const Cryptr = require('cryptr');
const cryptr = new Cryptr(process.env.CRYPTR_KEY);

const register = asyncHandler(async (req, res) => {
  const { firstName, middleName, lastName, phoneNumber, email, password } =
    req.body;

  // let data = {
  //   firstName,
  //   middleName,
  //   lastName,
  //   phoneNumber,
  //   email,
  //   password,
  // };

  // validation
  if (!firstName || !lastName || !phoneNumber || !email || !password) {
    res.status(400);
    throw new Error('Please fill in all the required fields.');
  }
  if (password.length < 8) {
    res.status(400);
    throw new Error('Password must be up to 8 characters.');
  }

  const userExists = await User.findOne({ email });
  const phoneExists = await User.findOne({ phoneNumber });
  if (userExists) {
    res.status(401);
    throw new Error('Email already in use.');
  }
  if (phoneExists) {
    res.status(401);
    throw new Error('The phone number is already in use.');
  }

  const ua = parser(req.headers['user-agent']);
  const userAgent = [ua.ua];

  const user = await User.create({
    firstName,
    middleName,
    lastName,
    phoneNumber,
    email,
    password,
    userAgent,
  });

  const token = generateToken(user._id);

  // Send HTTP-only cookie
  res.cookie('token', token, {
    path: '/',
    httpOnly: true,
    expires: new Date(Date.now() + 1000 * 86400), // 1 day
    sameSite: 'none',
    secure: true,
  });

  if (user) {
    const {
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
    } = user;

    res.status(201).json({
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
      token,
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(401);
    throw new Error('Please add email and password. ');
  }

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error('User not found, please register');
  }

  const passwordIsCorrect = user.checkPassword(password);
  if (!passwordIsCorrect) {
    res.status(400);
    throw new Error('Invalid email or password');
  }

  const ua = parser(req.headers['user-agent']);
  const thisUserAgent = ua.ua;
  console.log(thisUserAgent);

  const allowedAgent = user.userAgent.includes(thisUserAgent);

  if (!allowedAgent) {
    const loginCode = Math.floor(10000 + Math.random() * 90000);
    console.log(loginCode);
    const encryptedLoginCode = cryptr.encrypt(loginCode.toString());

    let userToken = await Token.findOne({ userId: user._id });
    if (userToken) {
      await userToken.deleteOne();
    }

    await new Token({
      userId: user._id,
      loginToken: encryptedLoginCode,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * (60 * 1000), // 60mins
    }).save();

    res.status(400);
    throw new Error('New browser or device detected');
  }

  if (user && passwordIsCorrect) {
    const token = generateToken(user._id);
    res.cookie('token', token, {
      path: '/',
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * 86400), // 1 day
      sameSite: 'none',
      secure: true,
    });
    const {
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
    } = user;
    res.status(200).json({
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
      token,
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

const sendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User Not Found.');
  }

  if (user.isVerified) {
    res.status(400);
    throw new Error('User already verified');
  }

  const token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }

  const verificationToken = crypto.randomBytes(32).toString('hex') + user._id;
  console.log(verificationToken);
  const hashedToken = hashToken(verificationToken);

  await new Token({
    userId: user._id,
    verifyToken: hashedToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60 * (60 * 1000),
  }).save();

  const verificationUrl = `${process.env.FRONTEND_URL}/verify/${verificationToken}`;

  const subject = 'Verify Your Account - TG Trade';
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = 'noReply@TgAcademy.com';
  const template = 'verifyEmail';
  const name = user.firstName;
  const link = verificationUrl;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: 'Verification Email Sent' });
  } catch (error) {
    res.status(500);
    throw new Error('Email not sent, please try again');
  }
});

const verifyUser = asyncHandler(async (req, res) => {
  const { verificationToken } = req.params;

  const hashedToken = hashToken(verificationToken);

  const userToken = await Token.findOne({
    verifyToken: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error('Invalid or Expired Token');
  }

  const user = await User.findOne({ _id: userToken.userId });
  if (user.isVerified) {
    res.status(400);
    throw new Error('User is already verified');
  }

  user.isVerified = true;
  await user.save();
  res.status(200).json({ message: 'Account verification successful.' });
});

const logout = asyncHandler(async (req, res) => {
  res.cookie('token', ' ', {
    path: '/',
    httpOnly: true,
    expires: new Date(0),
    sameSite: 'none',
    secure: true,
  });

  return res.status(200).json({ message: 'Logout successful' });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    const {
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
    } = user;
    res.status(201).json({
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    const {
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
    } = user;

    user.email = email;
    user.firstName = req.body.firstName || firstName;
    user.middleName = req.body.middleName || middleName;
    user.lastName = req.body.lastName || lastName;
    user.phoneNumber = req.body.phoneNumber || phoneNumber;
    user.avatar = req.body.avatar || avatar;
    const updatedUser = await user.save();

    res.status(201).json({
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      middleName: updatedUser.middleName,
      lastName: updatedUser.lastName,
      phoneNumber: updatedUser.phoneNumber,
      email: updatedUser.email,
      avatar: updatedUser.avatar,
      role: updatedUser.role,
      isVerified: updatedUser.isVerified,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({
    message: 'User deleted successfully',
  });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort('-createdAt').select('-password');
  if (!users) {
    res.status(500);
    throw new Error('Something went wrong');
  }

  res.status(200).json(users);
});

const loginStatus = asyncHandler(async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json(false);
  }

  const verify = jwt.verify(token, process.env.JWT_SECRET);
  if (verify) {
    return res.json(true);
  }
  return res.json(false);
});

const upgradeUser = asyncHandler(async (req, res) => {
  const { id, role } = req.body;
  const user = await User.findById(id);

  if (!user) {
    res.status(404);
    throw new Error('User Not Found1. ');
  }

  user.role = role;
  await user.save();
  res.status(200).json({ message: `User role updated to ${role}` });
  // res.json(user);
});

const sendAutomatedEmail = asyncHandler(async (req, res) => {
  const { subject, send_to, reply_to, template, url } = req.body;
  if (!subject || !send_to || !template || !reply_to) {
    res.status(500);
    throw new Error('Missing email parameter');
  }

  const user = await User.findOne({ email: send_to });
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const sent_from = process.env.EMAIL_USER;
  const name = user.firstName;
  const link = `${process.env.FRONTEND_URL}${url}`;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: 'Email Sent' });
  } catch (error) {
    res.status(500);
    throw new Error('Email not sent, please try again');
  }
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error('No user with this Email.');
  }

  const token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }

  const resetToken = crypto.randomBytes(32).toString('hex') + user._id;
  console.log(resetToken);

  const hashedToken = hashToken(resetToken);

  await new Token({
    userId: user._id,
    resetPassToken: hashedToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60 * (60 * 1000),
  }).save();

  const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const subject = 'Password Reset Request  - TG Trade';
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = 'noReply@tgacademy.com';
  const template = 'forgotPassword';
  const name = user.firstName;
  const link = resetURL;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: 'Password Reset Email Sent.' });
  } catch (error) {
    res.status(500);
    throw new Error('Email not sent, Please try again.');
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken } = req.params;
  const { password } = req.body;

  const hashedToken = hashToken(resetToken);
  const userToken = await Token.findOne({
    resetPassToken: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error('Invalid or Expired Token');
  }

  const user = await User.findOne({ _id: userToken.userId });

  user.password = password;
  await user.save();
  res.status(200).json({ message: 'Password reset successful, Please login' });
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, password } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (!oldPassword || !password) {
    res.status(400);
    throw new Error('Please enter old and new password');
  }

  const passwordIsCorrect = user.checkPassword(oldPassword);
  if (!passwordIsCorrect) {
    res.status(400);
    throw new Error('Old password is incorrect');
  }

  user.password = password;
  await user.save();
  res
    .status(200)
    .json({ message: 'Password change successful, please re-login' });
});

const sendLoginCode = asyncHandler(async (req, res) => {
  const { email } = req.params;

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error('User Not Found.');
  }

  const userToken = await Token.findOne({
    userId: user._id,
    expiresAt: { $gt: Date.now() },
  });
  if (!userToken) {
    res.status(404);
    throw new Error('Invalid or Expired token, please login again');
  }

  const loginCode = userToken.loginToken;
  const decryptedLoginCode = cryptr.decrypt(loginCode);

  const subject = 'Login Access Code  - TG Trade';
  const send_to = email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = 'noReply@tgacademy.com';
  const template = 'loginCode';
  const name = user.firstName;
  const link = decryptedLoginCode;

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      name,
      link
    );
    res.status(200).json({ message: `Access code sent to ${email}` });
  } catch (error) {
    res.status(500);
    throw new Error('Email not sent, please try again.');
  }
});

const loginWithCode = asyncHandler(async (req, res) => {
  const { email } = req.params;
  const { loginCode } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    res.send(404);
    throw new Error('User Not Found.');
  }

  const userToken = await Token.findOne({
    userId: user._id,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error('Invalid or Expired token, please login again');
  }
  const decryptedLoginCode = cryptr.decrypt(userToken.loginToken);
  if (decryptedLoginCode !== loginCode) {
    res.status(400);
    throw new Error('Incorrect login code, please try again');
  } else {
    const ua = parser(req.headers['user-agent']);
    const thisUserAgent = ua.ua;
    user.userAgent.push(thisUserAgent);
    await user.save();

    const token = generateToken(user._id);

    res.cookie('token', token, {
      path: '/',
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * 86400),
      sameSite: 'none',
      secure: true,
    });

    const {
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
    } = user;

    res.status(200).json({
      _id,
      firstName,
      middleName,
      lastName,
      phoneNumber,
      email,
      avatar,
      isVerified,
      token,
    });
  }
});

// const loginWithCode=asyncHandler(async(req,res)=>{res.send("successfully")})

module.exports = {
  login,
  register,
  logout,
  getUser,
  updateUser,
  deleteUser,
  getAllUsers,
  loginStatus,
  upgradeUser,
  sendAutomatedEmail,
  sendVerificationEmail,
  verifyUser,
  forgotPassword,
  resetPassword,
  changePassword,
  sendLoginCode,
  loginWithCode,
};
