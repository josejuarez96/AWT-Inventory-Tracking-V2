const express = require('express');
const bcrypt = require('bcrypt');
const { body, param, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const validatePassword = require('../lib/validatePassword');

const router = express.Router();

// Lightweight list for dropdowns — any authenticated user can see active user names
router.get('/list', authenticate, async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: 'asc' },
  });
  return res.json({ users });
});

// All remaining users routes require admin role
router.use(authenticate, requireAdmin);

// GET /api/users
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ users });
});

// POST /api/users
router.post(
  '/',
  [
    body('username')
      .trim()
      .notEmpty()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be 3-50 characters'),
    body('password').notEmpty().withMessage('Password is required'),
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('role').isIn(['admin', 'user']).withMessage('Role must be admin or user'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, fullName, role } = req.body;

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const existing = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        passwordHash,
        fullName,
        role,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return res.status(201).json({ user });
  }
);

// PUT /api/users/:id
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('fullName').optional().trim().notEmpty(),
    body('role').optional().isIn(['admin', 'user']),
    body('password').optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.id);
    const { fullName, role, password } = req.body;

    if (password !== undefined) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
    }

    // Check user exists first (avoids overflow errors for very large IDs)
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (role !== undefined) updateData.role = role;
    if (password !== undefined) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    return res.json({ user });
  }
);

// PATCH /api/users/:id/status
router.patch(
  '/:id/status',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('isActive').isBoolean().withMessage('isActive must be boolean'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.id);
    const { isActive } = req.body;

    if (userId === req.user.id && !isActive) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    return res.json({ user });
  }
);

module.exports = router;
