const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'Authentication token required' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            include: {
                studentProfile: decoded.role === 'STUDENT',
                teacherProfile: decoded.role === 'TEACHER',
                collegeAdminProfile: decoded.role === 'COLLEGE_ADMIN'
            }
        });
        
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        
        // Check if user is approved
        let isApproved = false;
        
        if (user.role === 'STUDENT' && user.studentProfile) {
            isApproved = user.studentProfile.isApproved;
        } else if (user.role === 'TEACHER' && user.teacherProfile) {
            isApproved = user.teacherProfile.isApproved;
        } else if (user.role === 'COLLEGE_ADMIN' && user.collegeAdminProfile) {
            isApproved = user.collegeAdminProfile.isApproved;
        } else if (user.role === 'SYSTEM_ADMIN') {
            isApproved = true;
        }
        
        if (!isApproved) {
            return res.status(403).json({ message: 'Your account is pending approval' });
        }
        
        // Add user to request object
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        };
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        
        res.status(500).json({ message: 'Authentication error', error: error.message });
    }
};

module.exports = {
    authenticate
};