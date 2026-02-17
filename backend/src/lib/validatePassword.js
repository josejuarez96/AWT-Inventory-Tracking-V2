/**
 * Validates password strength: min 8 chars, 1 uppercase, 1 lowercase, 1 number.
 * Returns null if valid, or an error message string if invalid.
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number';
  }
  if (!/\d/.test(password)) {
    return 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number';
  }
  return null;
}

module.exports = validatePassword;
