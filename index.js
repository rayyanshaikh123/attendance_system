const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql2');
dotenv.config();
const { v4: uuidv4 } = require('uuid');
const { Server } = require("socket.io");
const { createServer } = require("http");

const app = express();
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Adjust as needed
    queueLimit: 0,
  });
  
  db.getConnection((err, connection) => {
    if (err) {
      console.error('Error connecting to the database:', err);
    } else {
      console.log('Connected to the database!');
      connection.release(); // Release connection back to the pool
    }
  });
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASS;
const server = createServer(app);
const io = new Server(server);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const sessionStore = new MySQLStore({}, db.promise());

const sessionMiddleware = session({ 
    secret: 'your-secret-key', 
    resave: false, 
    saveUninitialized: false, 
    store: sessionStore 
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());
app.use(cors());
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});
app.use('/admin', require('./routes/admin'));
app.use('/admin-o', require('./routes/admin-geo'));
app.use('/user', require('./routes/manual'));
app.use('/geo', require('./routes/geo'));

app.use(express.static('public'));



passport.use('user-local', new LocalStrategy(
    {
        usernameField: 'email',
        passwordField: 'password'
    },
    (email, password, done) => {
        const query = 'SELECT * FROM users WHERE email = ?';
        db.query(query, [email], (err, results) => {
            if (err) return done(err);
            if (results.length === 0) return done(null, false, { message: 'Incorrect email.' });

            const user = results[0];
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) return done(err);
                if (isMatch) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: 'Incorrect password.' });
                }
            });
        });
    }
));

passport.use('admin-local', new LocalStrategy(
    {
        usernameField: 'email',
        passwordField: 'password'
    },
    (email, password, done) => {
        if (email === adminEmail && password === adminPassword) {
            return done(null, { id: 1, email: adminEmail, type: 'admin' });
        } else {
            return done(null, false, { message: 'Incorrect admin credentials.' });
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, { id: user.id, type: user.type || 'user' });
});

passport.deserializeUser((obj, done) => {
    if (obj.type === 'admin') {
        done(null, { id: obj.id, email: adminEmail, type: 'admin' });
    } else {
        const query = 'SELECT * FROM users WHERE id = ?';
        db.query(query, [obj.id], (err, results) => {
            if (err) return done(err);
            done(null, results[0]);
        });
    }
});

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.type === 'admin') {
        return next();
    }
    res.redirect('/admin/login');
}

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/', (req, res) => {
    res.render('cover');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/home', isAuthenticated, (req, res) => {
    const admin = req.user.type === 'admin';
    const userId = req.user.id;
    const onlineUsersQuery = "SELECT COUNT(DISTINCT userid) as count FROM attendance WHERE status = 'online'";
    const offlineUsersQuery = "SELECT COUNT(DISTINCT userid) as count FROM attendance WHERE status = 'offline'";
    const totalFenceQuery = "SELECT COUNT(DISTINCT geoid) as count FROM geofence"
    try {
        db.query(onlineUsersQuery, (err, onlineUsersResults) => {
            if (err) {
                console.error('Error fetching online users:', err);
                res.status(500).send('Server Error');
                return;
            }
            const onlineUsers = onlineUsersResults[0].count;

            db.query(offlineUsersQuery, (err, offUsersResults) => {
                if (err) {
                    console.error('Error fetching online users:', err);
                    res.status(500).send('Server Error');
                    return;
                }
                const offlineUsers = offUsersResults[0].count;
                db.query(totalFenceQuery, (err, totalFenceResults) => {
                    if (err) {
                        console.error('Error fetching online users:', err);
                        res.status(500).send('Server Error');
                        return;
                    }
                    const totalFence = totalFenceResults[0].count;

console.log(totalFence)

                res.render('home', { admin, userId, offlineUsers, onlineUsers, totalFence });
            });

            });
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).send('Server Error');
    }
});
async function idmake(table, column) {
    let id = uuidv4();
    const query = `SELECT * FROM ${table} WHERE ${column} = ?`;

    return new Promise((resolve, reject) => {
        db.query(query, [id], (err, rows) => {
            if (err) {
                console.error('Error executing query:', err);
                return reject(err);  // Reject the promise if there's an error
            }

            if (rows.length === 0) {
                return resolve(id);  // Resolve the promise with the unique ID
            } else {
                // Recursively call idmake until a unique ID is found
                idmake(table, column).then(resolve).catch(reject);
            }
        });
    });
}

app.post('/signup', async (req, res) => {
    let ide = await idmake("users", "id");
    console.log(ide);
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)';
        db.query(query, [ide, username, email, hashedPassword], (err, results) => {
            if (err) {
                console.error('Error executing query:', err);
                res.status(500).send('Server Error');
                return;
            }
            console.log(results);
            res.redirect('/admin/users');
        });
    } catch (err) {
        console.error('Error hashing password:', err);
        res.status(500).send('Server Error');
    }
});

app.post('/login', (req, res, next) => {
    console.log(req.body);
    passport.authenticate('user-local', (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return next(err);
        }
        if (!user) {
            console.log('Authentication failed:', info.message);
            return res.status(401).json({ message: 'Authentication failed', reason: info.message });
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return next(err);
            }
            
            console.log('Authentication successful');
            return res.json({ message: 'Authentication successful', user });
        });
    })(req, res, next);
});


app.post('/admin-login', passport.authenticate('admin-local', {
    successRedirect: '/admin/dashboard',
    failureRedirect: '/admin/login'
}));

app.post('/logout', async (req, res) => {
    const userId = req.user.id; // Assuming user ID is stored in req.user

    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    // Get current date and time
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}:${seconds}`;
    
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const ourdate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    // Update attendance record to mark user as offline and set signout time
    db.query('UPDATE attendance SET status = ?, signout_time = ? WHERE userid = ? AND date = ?', 
    ['offline', currentTime, userId, ourdate], (err, results) => {
        if (err) {
            console.error('Error updating attendance:', err);
            return res.status(500).send('Server Error');
        }

        req.logout((err) => {
            if (err) {
                console.error('Error logging out:', err);
                return res.status(500).send('Server Error');
            }
            res.redirect('/');
        });
    });
});

process.on('SIGINT', () => {
    db.end((err) => {
        if (err) {
            console.error('Error closing the database connection:', err);
        }
        console.log('Database connection closed');
        process.exit();
    });
});

app.get('/users', (req, res) => {
 let d= new Date()
 let a=d.getHours()
console.log(d);
console.log(a);


const startHour = 9;
const endHour = 18;






let acc = (a >= startHour && a < endHour) ? "present" : "absent";
db.query("select * from request",(err,rows)=>{
    console.log(rows);
})

});

const port = 3000;
// io.use((socket, next) => {
//     const session = socket.request.session;
//     if (session && session.passport && session.passport.user) {
//         next();
//     } else {
//         next(new Error("Not authenticated"));
//     }
// });

const customIdSocketMap = new Map();

io.on("connection", (socket) => {
    console.log(`Socket connected with ID: ${socket.id}`);

    // Event to receive custom ID from client and map it
    socket.on("set-custom-id", (data) => {
        const customId = data.customId;
        if (customId) {
            customIdSocketMap.set(customId, socket);
            console.log(`Custom ID ${customId} mapped to socket ID: ${socket.id}`);
            socket.emit("custom-id-set", { success: true, customId });
        } else {
            console.error("Custom ID not provided");
            socket.emit("custom-id-set", { success: false, error: "Custom ID not provided" });
        }
    });

    socket.on("disconnect", () => {
        // Find and remove the custom ID associated with this socket
        for (const [customId, socketInMap] of customIdSocketMap.entries()) {
            if (socketInMap.id === socket.id) {
                customIdSocketMap.delete(customId);
                console.log(`User with custom ID ${customId} disconnected`);
                break;
            }
        }
    });

    socket.on("send-admin", (data) => {
        const targetCustomId = 1; // Replace with the desired admin ID
        const targetSocket = customIdSocketMap.get(targetCustomId);

        if (targetSocket) {
            targetSocket.emit("receive-message", data);
            console.log(`Message sent to user with custom ID ${targetCustomId}`);
        } else {
            console.log(`User with custom ID ${targetCustomId} is not connected`);
        }
    });
});
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
