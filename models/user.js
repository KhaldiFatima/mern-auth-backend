const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'Please add a first name'],
    },
    middleName: {
      type: String,
      require: false,
    },
    lastName: {
      type: String,
      required: [true, 'Please add a last name'],
    },
    email: {
      type: String,
      required: [true, 'Please add a email'],
      trim: true,
      unique: true,
      match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        'Please enter a valid email',
      ],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Please add a phone number'],
      // unique: true,
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
    },
    avatar: {
      type: String,
      required: [true, 'Please add a photo'],
      default:
        'https://github.com/KhaldiFatima/mern-auth-frontend/blob/main/src/assets/New%20folder/p.png?raw=true',
    },
    bio: {
      type: String,
      default: 'bio',
    },
    role: {
      type: String,
      required: true,
      default: 'user',
      // user , suspended, and admin
    },
    isVerified: {
      type: Boolean,
      default: false,
    },

    userAgent: {
      type: Array,
      required: true,
      default: [],
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(this.password, salt);
  this.password = hashedPassword;
  next();
});

userSchema.method('checkPassword', function (password) {
  return bcrypt.compareSync(password, this.password);
});

const User = mongoose.model('User', userSchema);
module.exports = User;
