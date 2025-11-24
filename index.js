const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
dotenv.config();
const { v4: uuidv4 } = require('uuid');
const User = require('./models/User');
const Attendance = require('./models/Attendance');
const Geofence = require('./models/Geofence');
const Request = require('./models/Request');
const { Server } = require("socket.io");
const { createServer } = require("http");

const app = express();
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/attendance_system';
mongoose.connect(mongoURI);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASS;
const server = createServer(app);
const io = new Server(server);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const sessionMiddleware = session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: mongoURI,
        collectionName: 'sessions',
    }),
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
    async (email, password, done) => {
        try {
            const user = await User.findOne({ email });
            if (!user) return done(null, false, { message: 'Incorrect email.' });
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) return done(null, user);
            return done(null, false, { message: 'Incorrect password.' });
        } catch (err) {
            return done(err);
        }
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

passport.deserializeUser(async (obj, done) => {
    if (obj.type === 'admin') {
        done(null, { id: obj.id, email: adminEmail, type: 'admin' });
    } else {
        try {
            const user = await User.findById(obj.id);
            done(null, user);
        } catch (err) {
            done(err);
        }
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




app.post('/login', (req, res, next) => {
    passport.authenticate('user-local', (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return next(err);
        }
        if (!user) {
            return res.status(401).json({ message: 'Authentication failed', reason: info.message });
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return next(err);
            }

            // Redirect based on role; do not expose password in logs or responses
            const role = user.role || user.type || 'user';
            if (role === 'admin') {
                return res.redirect('/admin/dashboard');
            }
            return res.redirect('/home');
        });
    })(req, res, next);
});


app.post('/admin-login', passport.authenticate('admin-local', {
    successRedirect: '/admin/dashboard',
    failureRedirect: '/admin/login'
}));

// Public pages
app.get('/', (req, res) => {
    res.render('cover');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
});

// Signup handler
app.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).send('Missing fields');
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).send('User already exists');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        await User.create({ username, email, password: hash, role: 'user' });
        return res.redirect('/login');
    } catch (err) {
        console.error('Signup error:', err);
        return res.status(500).send('Server error');
    }
});

app.get('/home', isAuthenticated, async (req, res) => {
    try {
        const isAdminUser = req.user && (req.user.type === 'admin' || req.user.role === 'admin');
        if (isAdminUser) {
            const totalFence = await Geofence.countDocuments();
            const onlineUsersArr = await Attendance.distinct('userid', { status: 'online' });
            const onlineUsers = onlineUsersArr.length;
            const totalUsers = await User.countDocuments();
            const offlineUsers = Math.max(0, totalUsers - onlineUsers);
            return res.render('home', { user: req.user, admin: true, onlineUsers, offlineUsers, totalFence });
        }

        return res.render('home', { user: req.user, admin: false, userId: req.user.id });
    } catch (err) {
        console.error('Error rendering home:', err);
        return res.status(500).send('Server error');
    }
});

app.post('/logout', async (req, res) => {
    const userId = req.user && req.user.id;

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

    try {
        await Attendance.updateOne({ userid: userId, date: ourdate }, { $set: { status: 'offline', signout_time: currentTime } });
    } catch (err) {
        console.error('Error updating attendance:', err);
        // proceed to logout even if attendance update failed
    }

    req.logout((err) => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).send('Server Error');
        }
        res.redirect('/');
    });
});

// No MySQL connection to close. Mongoose will handle connections.

app.get('/users', (req, res) => {
    (async () => {
        try {
            const users = await User.find().select('-password');
            return res.json(users);
        } catch (err) {
            console.error('Error fetching users:', err);
            return res.status(500).send('Server error');
        }
    })();

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
