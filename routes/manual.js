const express = require('express');
const Router = express.Router();
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const methodOverride = require('method-override');
const mysql = require('mysql2');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

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
//   db.connect((err) => {
//     if (err) {
//       console.error('Error connecting to the database:', err);
//     } else {
//       console.log('Connected to the database!');
//     }
//   });
const sessionStore = new MySQLStore({}, db.promise());

// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.type === 'admin') {
        return next();
    }
    res.redirect('/admin/login');
}

async function idmake(table, column) {
    let id = uuidv4();
    const query = `SELECT * FROM ${table} WHERE ${column} = ?`;

    return new Promise((resolve, reject) => {
        db.query(query, [id], (err, rows) => {
            if (err) {
                console.error('Error executing query:', err);
                return reject(err);
            }

            if (rows.length === 0) {
                return resolve(id);
            } else {
                // Recursively call idmake until a unique ID is found
                idmake(table, column).then(resolve).catch(reject);
            }
        });
    });
}

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = now.getDate();
const ourdate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

Router.post("/new/temp-geo", async (req, res) => {
    const { longitude, latitude, description } = req.body;
    console.log(req.body);
    const userid = req.user.id;
    console.log(userid);
    try {
        let id = await idmake("request", "reqid");
        const query = `SELECT * FROM request WHERE latitude = ? AND longitude = ? AND date = ?`;
        db.query(query, [latitude, longitude, ourdate], (err, rows) => {
            if (err) {
                console.log('Error:', err);
                res.sendStatus(500);
            } else if(rows.length===0) {
                const insertQuery = `INSERT INTO request (reqid, userid, latitude, longitude, date, description,status) VALUES (?, ?, ?, ?, ?, ?,?)`;
                db.query(insertQuery, [id, userid, latitude, longitude, ourdate, description,"pen"], (err) => {
                    if (err) {
                        console.log('Error:', err);
                        res.sendStatus(500);
                    } else {
                        db.query("select * from request ",(err,rows)=>{
console.log(rows);
                        })
                        res.send("Request created successfully");
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.sendStatus(500);
    }
});

Router.get("/new/temp", (req, res) => {
    res.render("new-temp");
});

Router.post("/show/temp", (req, res) => {
    db.query("SELECT r.*, u.username FROM users u JOIN request r ON u.id = r.userid WHERE r.date = ? and r.status =?", [ourdate,"pen"], (err, rows) => {
        if (err) {
            console.log("Error:", err);
            res.sendStatus(500);
        } else {
            
            res.status(200).json(rows);
        }
    });
});

Router.get("/show/temp-geo", async (req, res) => {
    try {
        const { data: requests } = await axios.post("http://localhost:3000/user/show/temp");
        console.log(requests);
        res.render("show-temp", { requests });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.sendStatus(500);
    }
});
Router.post("/find/:id",async(req,res)=>{
    const {id}=req.params;
    db.query("select * from request where reqid=?",[id],(err,rows)=>{
        if(err){
            console.log("pranav tp mat kar"+err);
        }
        res.send(rows)
    })
})
Router.post("/admin/requests/:id/accept", async (req, res) => {
    const { id } = req.params;
    
    try {
        let response = await axios.post(`http://localhost:3000/user/find/${id}`);
        let temp = response.data[0]; // Assuming 'data' is an array with a single object

        // Generate a unique ID for temgeo
        let ide = await idmake("temgeo", "tempid");

        // Update the status of the request to 'accepted'
        db.query("UPDATE request SET status = ? WHERE reqid = ?", ["accept", id], (err) => {
            if (err) {
                console.log("Error updating request status:", err);
                res.sendStatus(500);
                return;
            }
            
            // Check if a similar entry exists in temgeo
            const query = "SELECT * FROM temgeo WHERE latitude = ? AND longitude = ? AND date = ?";
            db.query(query, [temp.latitude, temp.longitude, temp.date], (err, rows) => {
                if (err) {
                    console.log("Error occurred:", err);
                    res.sendStatus(500);
                    return;
                }
                
                // If no similar entry exists, insert the new data
                if (rows.length === 0) {
                    let insertQuery = `
                        INSERT INTO temgeo (tempid, latitude, longitude, radius, name, date) VALUES (?, ?, ?, ?, ?, ?)
                    `;
                    db.query(insertQuery, [ide, temp.latitude, temp.longitude,200, ide, temp.date], (err, rows) => {
                        if (err) {
                            console.log("Error while inserting into temgeo:", err);
                            res.sendStatus(500);
                            return;
                        }
                        
                        console.log("Inserted into temgeo:", rows);
                        res.redirect("/user/show/temp-geo");
                    });
                } else {
                    console.log("Entry already exists in temgeo");
                    res.redirect("/user/show/temp-geo");
                }
            });
        });
    } catch (error) {
        console.error("Error processing request:", error);
        res.sendStatus(500);
    }
});


Router.post("/admin/requests/:id/reject", async (req, res) => {
    const { id } = req.params;
    db.query("UPDATE request SET status = 'rejected' WHERE reqid = ?", [id], (err) => {
        if (err) {
            console.log("Error updating request status:", err);
            res.sendStatus(500);
        } else {
            res.redirect("/admin/requests");
        }
    });

});
Router.get("/temp-geos",(req,res)=>{
    const query="select * from temgeo where date=?"
    db.query(query,[ourdate],(err,rows)=>{
        console.log(rows);
        res.send(rows).status(200)
    })
})
Router.post("/history",(req,res)=>{
    const id=req.user.id;
    db.query("select * from attendance where userid=?",[id],(err,rows)=>{
        if(err){console.log(err);
            res.send("error while fetching history ples try later").status(404)
        }
        else{
        if(rows.length===0){
            res.send("error while fetching history ples try later").status(404)
        }
        else{
            console.log(rows);
            res.send(rows).status(200)

        }}
    })
})
Router.post("/history/req",(req,res)=>{
    const id=req.user.id;
    db.query("select * from request where userid=?",[id],(err,rows)=>{
        if(err){
            console.log(err);
            res.send("error while fetching history ples try later").status(404)
        }
        else{
        if(rows.length===0){
            res.send("error while fetching history ples try later").status(404)
        }
        else{
            console.log(rows);
            console.log("helo");
            res.send(rows).status(200)

        }}
    })
})
module.exports = Router;