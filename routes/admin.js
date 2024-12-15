const express = require('express');
const Router = express.Router();
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const methodOverride = require('method-override');
const mysql = require('mysql2');

// Middleware setup
Router.use(methodOverride('_method'));

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Adjust as needed
    queueLimit: 0,
  });
const sessionStore = new MySQLStore({}, db.promise());

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
Router.get('/dashboard', isAdmin, (req, res) => {
    const totalUsersQuery = 'SELECT COUNT(*) as count FROM users';
    const onlineUsersQuery = "SELECT COUNT(DISTINCT userid) as count FROM attendance WHERE status = 'online'";

    sessionStore.all((err, sessions) => {
        if (err) {
            console.error('Error fetching sessions:', err);
            res.status(500).send('Server Error');
            return;
        }
        const loggedInUsers = Object.values(sessions).filter(session => session.passport && session.passport.user).length;

        db.query(totalUsersQuery, (err, totalUsersResults) => {
            if (err) {
                console.error('Error fetching total users:', err);
                res.status(500).send('Server Error');
                return;
            }
            const totalUsers = totalUsersResults[0].count;

            db.query(onlineUsersQuery, (err, onlineUsersResults) => {
                if (err) {
                    console.error('Error fetching online users:', err);
                    res.status(500).send('Server Error');
                    return;
                }
                const onlineUsers = onlineUsersResults[0].count;
                const loggedOutUsers = totalUsers - onlineUsers;
                res.render('dashboard', { totalUsers, loggedInUsers, loggedOutUsers, onlineUsers });
            });
        });
    });
});

// Route to get all users
Router.get('/users', isAdmin, (req, res) => {
    const query = "SELECT * FROM users;";
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching users:', err);
            res.status(500).send('Server Error');
            return;
        }
        res.render('user', { users: results });
    });
});


Router.get('/users/create', isAdmin, (req,res)=>{
    res.render('register.ejs')
})





// Route to get a single user for updating
Router.get('/users/:id', isAdmin, (req, res) => {
    const { id } = req.params;
    const query = "SELECT * FROM users WHERE id = ?;";
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error fetching user:', err);
            res.status(500).send('Server Error');
            return;
        }
        res.render('update', { users: results[0] });
    });
});

// Route to update a user
Router.patch('/users/:id', isAdmin, (req, res) => {
    const { id } = req.params;
    const { username, email } = req.body;
    const query = 'UPDATE users SET username = ?, email = ? WHERE id = ?';
    db.query(query, [username, email, id], (err, results) => {
        if (err) {
            console.error('Error updating user:', err);
            res.status(500).send('Server Error');
            return;
        }
        res.redirect('/admin/users');
    });
});

// Route to delete a user
Router.delete('/users/:id', isAdmin, (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM users WHERE id = ?';
    const query2 = 'DELETE FROM attendance WHERE userid = ?';
    
    db.query(query2, [id], (err, results) => {
        if (err) {
            console.error('Error deleting user:', err);
            res.status(500).send('Server Error');
            return;
        }
        db.query(query, [id], (err, results) => {
            if (err) {
                console.error('Error deleting user:', err);
                res.status(500).send('Server Error');
                return;
            }
            
            res.redirect('/admin/users');
        });
       
    });
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
Router.post('/calendar/:data', isAdmin, (req, res) => {
    const { data } = req.params;
    const query = 'SELECT u.*, a.accounted_for,a.signin_time,a.signout_time FROM users u JOIN attendance a ON u.id = a.userid WHERE a.date = ?';
    db.query(query, [data], (err, results) => {
        if (err) {
            console.error('Error fetching calendar data:', err);
            res.status(500).send('Server Error');
            return;
        }
        res.json(results);
    });
});
























module.exports = Router;