const asyncHandler = require('express-async-handler');
const User = require('../models/user');
const jwt = require('jsonwebtoken');

const protect = asyncHandler(async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      res.status(401);
      throw new Error('Not authorized, please login');
    }
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(verified.id).select('-password');

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }
    // console.log(user.role);
    if (user.role === 'suspended') {
      res.send('User suspended, please contact support');
      // res.status(400);
      // throw new Error('User suspended, please contact support');
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    throw new Error('Not authorized, please login');
  }
});

const adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(401);
    throw new Error('Not authorized as an admin');
  }
});
const userOnly = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'admin' || req.user.id === req.params.id) {
    next();
  } else {
    res.status(401);
    throw new Error('Not authorized as an user');
  }
});

const usersOnly = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    next();
  } else {
    res.status(401);
    throw new Error('Not authorized as an user');
  }
});

const verifiedOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.isVerified) {
    next();
  } else {
    res.status(401);
    throw new Error('Not authorized, account not verified');
  }
});

// const =asyncHandler(async(req,res,next)=>{})

module.exports = {
  protect,
  verifiedOnly,
  adminOnly,
  usersOnly,
  userOnly,
};
