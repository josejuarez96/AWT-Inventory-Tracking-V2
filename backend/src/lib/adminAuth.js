const bcrypt = require('bcrypt');
const prisma = require('./prisma');

/**
 * Verify admin credentials from a Basic auth header (used for secondary
 * approval on large adjustments, cycle count variances, etc.).
 *
 * @param {string} authHeader - "Basic <base64(username:password)>"
 * @returns {Promise<boolean>}
 */
async function verifyAdminCredentials(authHeader) {
  try {
    if (!authHeader || !authHeader.startsWith('Basic ')) return false;
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 1) return false;
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    if (!username || !password) return false;

    const adminUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    if (!adminUser || !adminUser.isActive || adminUser.role !== 'admin') return false;

    return bcrypt.compare(password, adminUser.passwordHash);
  } catch {
    return false;
  }
}

module.exports = { verifyAdminCredentials };
