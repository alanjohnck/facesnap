
const express = require('express');
const router = express.Router();
const  authController= require("../../Controllers/AuthControllers/authController")



const { authenticate } = require('../../Middleware/AuthenticateJWT');

// Auth routes
router.post('/login', authController.login);
router.post('/signup/student', authController.studentSignup);
router.post('/signup/teacher', authController.teacherSignup);
router.post('/signup/college-admin', authController.collegeAdminSignup);

// Approval routes (require authentication)
router.post('/approve/student', authenticate, authController.approveStudent);
router.post('/approve/teacher', authenticate, authController.approveTeacher);
router.post('/verify/college', authenticate, authController.verifyCollege);

// Dashboard and notifications
router.get('/dashboard', authenticate, authController.getDashboard);
router.get('/notifications', authenticate, authController.getNotifications);

// Attendance
router.post('/attendance', authenticate, authController.recordAttendance);


module.exports = router;