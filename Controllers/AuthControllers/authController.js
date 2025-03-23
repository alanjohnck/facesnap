const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Login function for all user types
const login = async (req, res) => {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            studentProfile: true,
            teacherProfile: true,
            collegeAdminProfile: true
        }
    });
    
    if (!user) {
        return res.status(400).json({ message: "User not found" });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(400).json({ message: "Invalid password" });
    }
    
    // Check if user is approved based on role
    if (
        (user.role === 'STUDENT' && !user.studentProfile?.isApproved) ||
        (user.role === 'TEACHER' && !user.teacherProfile?.isApproved) ||
        (user.role === 'COLLEGE_ADMIN' && !user.collegeAdminProfile?.isApproved)
    ) {
        return res.status(403).json({ message: "Your account is pending approval" });
    }
    
    // Generate token with role and id
    const token = jwt.sign(
        { 
            id: user.id, 
            role: user.role,
            collegeId: user.studentProfile?.collegeId || 
                      user.teacherProfile?.collegeId || 
                      user.collegeAdminProfile?.collegeId 
        }, 
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    res.json({ 
        token,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isApproved: user.studentProfile?.isApproved || 
                        user.teacherProfile?.isApproved || 
                        user.collegeAdminProfile?.isApproved
        }
    });
};

// Student signup
const studentSignup = async (req, res) => {
    const { name, email, password, collegeId } = req.body;
    
    try {
        // Check if college exists
        const college = await prisma.college.findUnique({
            where: { id: collegeId },
            include: { teachers: true }
        });
        
        if (!college) {
            return res.status(400).json({ message: "College not found" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user with student role
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'STUDENT',
                studentProfile: {
                    create: {
                        collegeId,
                        isApproved: false
                    }
                }
            },
            include: {
                studentProfile: true
            }
        });
        
        // Create notifications for all teachers in the college
        await Promise.all(college.teachers.map(teacher => 
            prisma.notification.create({
                data: {
                    userId: teacher.userId,
                    message: `New student ${name} (${email}) has requested approval`,
                    type: 'STUDENT_APPROVAL',
                    metadata: {
                        studentId: user.id
                    }
                }
            })
        ));
        
        res.status(201).json({ 
            message: "Student account created and pending teacher approval",
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: 'STUDENT',
                isApproved: false
            }
        });
    } catch (error) {
        res.status(400).json({ message: "Error creating student account", error: error.message });
    }
};

const getCollageDetails = async(req,res)=>{

    try{
    const collegeDetails = await prisma.college.findMany({
        where: {
            isVerified: true
        }
    });
    res.json(collegeDetails);
    }catch(e){
        res.status(400).json({ message: "Error fetching college details", error: error.message });
    }
}
// Teacher signup
const teacherSignup = async (req, res) => {
    const { name, email, password, collegeId, subject } = req.body;
    
    try {
        // Check if college exists
        const college = await prisma.college.findUnique({
            where: { id: collegeId },
            include: { collegeAdmins: true }
        });
        
        if (!college) {
            return res.status(400).json({ message: "College not found" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user with teacher role
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'TEACHER',
                teacherProfile: {
                    create: {
                        collegeId,
                        subject,
                        isApproved: false
                    }
                }
            }
        });
        
        // Create notifications for all college admins
        await Promise.all(college.collegeAdmins.map(admin => 
            prisma.notification.create({
                data: {
                    userId: admin.userId,
                    message: `New teacher ${name} (${email}) has requested approval`,
                    type: 'TEACHER_APPROVAL',
                    metadata: {
                        teacherId: user.id
                    }
                }
            })
        ));
        
        res.status(201).json({ 
            message: "Teacher account created and pending college admin approval",
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: 'TEACHER',
                isApproved: false
            }
        });
    } catch (error) {
        res.status(400).json({ message: "Error creating teacher account", error: error.message });
    }
};

// College Admin signup
const collegeAdminSignup = async (req, res) => {
    const { name, email, password, collegeName, collegeCode, collegeAddress } = req.body;

    try {
        // Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Check if college already exists (by name or code)
        const existingCollege = await prisma.college.findFirst({
            where: {
                OR: [
                    { name: collegeName },
                    { code: collegeCode }
                ]
            }
        });

        if (existingCollege) {
            return res.status(400).json({ message: "College already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create college and admin in a transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create the college (Automatically Verified)
            const college = await prisma.college.create({
                data: {
                    name: collegeName,
                    code: collegeCode,
                    address: collegeAddress,
                    isVerified: true // ✅ College is automatically verified
                }
            });

            // Create the college admin (Automatically Approved)
            const user = await prisma.user.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    role: 'COLLEGE_ADMIN',
                    collegeAdminProfile: {
                        create: {
                            collegeId: college.id,
                            isApproved: true // ✅ College admin is automatically approved
                        }
                    }
                },
                include: {
                    collegeAdminProfile: true
                }
            });

            return { user, college };
        });

        // Send success response
        res.status(201).json({
            message: "College admin account created and approved successfully",
            user: {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name,
                role: 'COLLEGE_ADMIN',
                isApproved: true
            },
            college: {
                id: result.college.id,
                name: result.college.name,
                code: result.college.code,
                isVerified: true
            }
        });

    } catch (error) {
        console.error("Signup Error:", error);
        res.status(400).json({ message: "Error creating college admin account", error: error.message });
    }
};

// Approve student (by teacher)
const approveStudent = async (req, res) => {
    const { studentId } = req.body;
    const teacherId = req.user.id; // From auth middleware
    
    try {
        // Check if teacher is approved
        const teacher = await prisma.user.findUnique({
            where: { id: teacherId },
            include: { teacherProfile: true }
        });
        
        if (!teacher || teacher.role !== 'TEACHER' || !teacher.teacherProfile.isApproved) {
            return res.status(403).json({ message: "Unauthorized: Only approved teachers can approve students" });
        }
        
        // Get student
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            include: { studentProfile: true }
        });
        
        if (!student || student.role !== 'STUDENT') {
            return res.status(404).json({ message: "Student not found" });
        }
        
        // Check if teacher and student are from the same college
        if (student.studentProfile.collegeId !== teacher.teacherProfile.collegeId) {
            return res.status(403).json({ message: "Unauthorized: You can only approve students from your college" });
        }
        
        // Update student approval status
        await prisma.studentProfile.update({
            where: { userId: studentId },
            data: { isApproved: true }
        });
        
        // Create notification for student
        await prisma.notification.create({
            data: {
                userId: studentId,
                message: `Your account has been approved by ${teacher.name}`,
                type: 'APPROVAL_CONFIRMED'
            }
        });
        
        res.json({ message: "Student approved successfully" });
    } catch (error) {
        res.status(400).json({ message: "Error approving student", error: error.message });
    }
};

// Approve teacher (by college admin)
const approveTeacher = async (req, res) => {
    const { teacherId } = req.body;
    const adminId = req.user.id; // From auth middleware
    
    try {
        // Check if admin is approved
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            include: { collegeAdminProfile: true }
        });
        
        if (!admin || admin.role !== 'COLLEGE_ADMIN' || !admin.collegeAdminProfile.isApproved) {
            return res.status(403).json({ message: "Unauthorized: Only approved college admins can approve teachers" });
        }
        
        // Get teacher
        const teacher = await prisma.user.findUnique({
            where: { id: teacherId },
            include: { teacherProfile: true }
        });
        
        if (!teacher || teacher.role !== 'TEACHER') {
            return res.status(404).json({ message: "Teacher not found" });
        }
        
        // Check if teacher and admin are from the same college
        if (teacher.teacherProfile.collegeId !== admin.collegeAdminProfile.collegeId) {
            return res.status(403).json({ message: "Unauthorized: You can only approve teachers from your college" });
        }
        
        // Update teacher approval status
        await prisma.teacherProfile.update({
            where: { userId: teacherId },
            data: { isApproved: true }
        });
        
        // Create notification for teacher
        await prisma.notification.create({
            data: {
                userId: teacherId,
                message: `Your account has been approved by ${admin.name}`,
                type: 'APPROVAL_CONFIRMED'
            }
        });
        
        res.json({ message: "Teacher approved successfully" });
    } catch (error) {
        res.status(400).json({ message: "Error approving teacher", error: error.message });
    }
};

// Verify college (by system admin)
const verifyCollege = async (req, res) => {
    const { collegeId } = req.body;
    const adminId = req.user.id; // From auth middleware
    
    try {
        // Check if user is system admin
        if (adminId !== process.env.SYSTEM_ADMIN_ID) {
            return res.status(403).json({ message: "Unauthorized: Only system admins can verify colleges" });
        }
        
        // Update college verification status
        const college = await prisma.college.update({
            where: { id: collegeId },
            data: { isVerified: true }
        });
        
        // Find college admin
        const collegeAdmin = await prisma.user.findFirst({
            where: {
                collegeAdminProfile: {
                    collegeId
                }
            }
        });
        
        // Approve college admin
        if (collegeAdmin) {
            await prisma.collegeAdminProfile.update({
                where: { userId: collegeAdmin.id },
                data: { isApproved: true }
            });
            
            // Create notification for college admin
            await prisma.notification.create({
                data: {
                    userId: collegeAdmin.id,
                    message: `Your college "${college.name}" has been verified and your account has been approved`,
                    type: 'COLLEGE_VERIFIED'
                }
            });
        }
        
        res.json({ message: "College verified successfully" });
    } catch (error) {
        res.status(400).json({ message: "Error verifying college", error: error.message });
    }
};



// Get notifications
const getNotifications = async (req, res) => {
    const userId = req.user.id; // From auth middleware
    
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        
        res.json(notifications);
    } catch (error) {
        res.status(400).json({ message: "Error fetching notifications", error: error.message });
    }
};

// Get dashboard data based on role
const getDashboard = async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;
    
    try {
        switch (role) {
            case 'STUDENT':
                const studentData = await prisma.user.findUnique({
                    where: { id: userId },
                    include: {
                        studentProfile: {
                            include: {
                                college: true,
                                attendance: true
                            }
                        }
                    }
                });
                
                // Get course data
                const courses = await prisma.course.findMany({
                    where: {
                        collegeId: studentData.studentProfile.collegeId
                    },
                    include: {
                        teacher: {
                            include: {
                                user: {
                                    select: {
                                        name: true,
                                        email: true
                                    }
                                }
                            }
                        }
                    }
                });
                
                return res.json({
                    name: studentData.name,
                    email: studentData.email,
                    college: studentData.studentProfile.college.name,
                    attendance: studentData.studentProfile.attendance,
                    courses
                });
                
            case 'TEACHER':
                const teacherData = await prisma.user.findUnique({
                    where: { id: userId },
                    include: {
                        teacherProfile: {
                            include: {
                                college: true,
                                courses: true
                            }
                        }
                    }
                });
                
                // Get students for this teacher's courses
                const studentsForTeacher = await prisma.user.findMany({
                    where: {
                        role: 'STUDENT',
                        studentProfile: {
                            collegeId: teacherData.teacherProfile.collegeId,
                            isApproved: true
                        }
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        studentProfile: {
                            include: {
                                attendance: {
                                    where: {
                                        courseId: {
                                            in: teacherData.teacherProfile.courses.map(c => c.id)
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                
                return res.json({
                    name: teacherData.name,
                    email: teacherData.email,
                    college: teacherData.teacherProfile.college.name,
                    subject: teacherData.teacherProfile.subject,
                    courses: teacherData.teacherProfile.courses,
                    students: studentsForTeacher
                });
                
            case 'COLLEGE_ADMIN':
                const adminData = await prisma.user.findUnique({
                    where: { id: userId },
                    include: {
                        collegeAdminProfile: {
                            include: {
                                college: true
                            }
                        }
                    }
                });
                
                // Get teachers in this college
                const teachers = await prisma.user.findMany({
                    where: {
                        role: 'TEACHER',
                        teacherProfile: {
                            collegeId: adminData.collegeAdminProfile.collegeId
                        }
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        teacherProfile: {
                            select: {
                                subject: true,
                                isApproved: true
                            }
                        }
                    }
                });
                
                // Get students in this college
                const students = await prisma.user.findMany({
                    where: {
                        role: 'STUDENT',
                        studentProfile: {
                            collegeId: adminData.collegeAdminProfile.collegeId
                        }
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        studentProfile: {
                            select: {
                                isApproved: true
                            }
                        }
                    }
                });
                
                return res.json({
                    name: adminData.name,
                    email: adminData.email,
                    college: adminData.collegeAdminProfile.college,
                    teachers,
                    students
                });
                
            default:
                return res.status(400).json({ message: "Invalid role" });
        }
    } catch (error) {
        res.status(400).json({ message: "Error fetching dashboard data", error: error.message });
    }
};

// Record attendance
const recordAttendance = async (req, res) => {
    const { studentId, courseId, status } = req.body;
    const teacherId = req.user.id; // From auth middleware
    
    try {
        // Verify teacher is authorized to record attendance for this course
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { teacher: true }
        });
        
        if (!course || course.teacher.userId !== teacherId) {
            return res.status(403).json({ message: "Unauthorized: You can only record attendance for your courses" });
        }
        
        // Verify student is enrolled in this college
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            include: { studentProfile: true }
        });
        
        if (!student || student.role !== 'STUDENT' || !student.studentProfile.isApproved) {
            return res.status(404).json({ message: "Student not found or not approved" });
        }
        
        // Record attendance
        const attendance = await prisma.attendance.create({
            data: {
                studentId: student.studentProfile.id,
                courseId,
                date: new Date(),
                status
            }
        });
        
        res.json({ message: "Attendance recorded successfully", attendance });
    } catch (error) {
        res.status(400).json({ message: "Error recording attendance", error: error.message });
    }
};

module.exports = {
    login,
    studentSignup,
    teacherSignup,
    collegeAdminSignup,
    approveStudent,
    approveTeacher,
    verifyCollege,
    getCollageDetails,
    getNotifications,
    getDashboard,
    recordAttendance
};