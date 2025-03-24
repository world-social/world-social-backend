const { body } = require('express-validator');

const validateVideoUpload = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters')
];

const validateUserRegistration = [
  body('worldId').notEmpty().withMessage('World ID is required'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores')
];

const validateUserLogin = [
  body('worldId').notEmpty().withMessage('World ID is required')
];

module.exports = {
  validateVideoUpload,
  validateUserRegistration,
  validateUserLogin
}; 