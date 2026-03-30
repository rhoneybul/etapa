const { Router } = require('express');
const router = Router();

// GET /api/users/me — return the authenticated user's profile
router.get('/me', (req, res) => {
  res.json({
    id:    req.user.id,
    email: req.user.email,
    name:  req.user.user_metadata?.full_name || req.user.user_metadata?.name || null,
  });
});

module.exports = router;
