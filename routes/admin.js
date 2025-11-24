const express = require('express');
const Router = express.Router();
const methodOverride = require('method-override');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

// Middleware setup
Router.use(methodOverride('_method'));



// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.type === 'admin') {
        return next();
    }
    res.redirect('/admin/login');
}

// Admin login route
Router.get('/login', (req, res) => {
    res.render('admin-login');
});

// Admin dashboard route
Router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const onlineUsers = await Attendance.distinct('userid', { status: 'online' });
        // If you want to count logged-in users via session, you need to implement session tracking with MongoDB
        const loggedInUsers = onlineUsers.length;
        const loggedOutUsers = totalUsers - loggedInUsers;
        res.render('dashboard', { totalUsers, loggedInUsers, loggedOutUsers, onlineUsers: loggedInUsers });
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).send('Server Error');
    }
});

// Route to get all users
Router.get('/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find();
        res.render('user', { users });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).send('Server Error');
    }
});


Router.get('/users/create', isAdmin, (req,res)=>{
    res.render('register.ejs')
})





// Route to get a single user for updating
Router.get('/users/:id', isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.render('update', { users: user });
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).send('Server Error');
    }
});

// Route to update a user
Router.patch('/users/:id', isAdmin, async (req, res) => {
    try {
        const { username, email } = req.body;
        await User.findByIdAndUpdate(req.params.id, { username, email });
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).send('Server Error');
    }
});

// Route to delete a user
Router.delete('/users/:id', isAdmin, async (req, res) => {
    try {
        await Attendance.deleteMany({ userid: req.params.id });
        await User.findByIdAndDelete(req.params.id);
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).send('Server Error');
    }
});

// Route to handle geo redirects
Router.get('/geo', isAdmin, (req, res) => {
    res.redirect('/home');
});

// Route to render calendar page
Router.get('/calendar', isAdmin, (req, res) => {
    res.render('calendar');
});

// Route to fetch calendar data
Router.post('/calendar/:data', isAdmin, async (req, res) => {
    try {
        const { data } = req.params;
        const attendance = await Attendance.find({ date: data });
        // Populate user info for each attendance record
        const results = await Promise.all(attendance.map(async (a) => {
            const user = await User.findById(a.userid);
            return {
                ...a.toObject(),
                username: user ? user.username : '',
                email: user ? user.email : '',
            };
        }));
        res.json(results);
    } catch (err) {
        console.error('Error fetching calendar data:', err);
        res.status(500).send('Server Error');
    }
});
























module.exports = Router;