const express = require('express');
const Router = express.Router();
const methodOverride = require('method-override');
const { v4: uuidv4 } = require('uuid');
const Geofence = require('../models/Geofence');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Middleware setup
Router.use(methodOverride('_method'));



// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.type === 'admin') {
        return next();
    }
    res.redirect('/admin/login');
}
// Generate a unique geofence ID (UUID)
function idmake() {
    return uuidv4();
}

Router.post("/create-geo", async (req, res) => {
    const { latitude, longitude, radius, name } = req.body;
    const ide = idmake();
    try {
        const exists = await Geofence.findOne({ latitude, longitude });
        if (exists) {
            return res.send("geo exists");
        }
        await Geofence.create({ _id: ide, latitude, longitude, radius, name });
        res.redirect("/admin-o/show/geofence");
    } catch (err) {
        console.log(`some error has occurred ${err}`);
        res.status(500).send("Error creating geofence");
    }
});
Router.post("/curr-geos", async (req, res) => {
    try {
        const geofences = await Geofence.find();
        res.status(200).send(geofences);
    } catch (err) {
        console.log(err);
        res.status(404).send("Sorry, could not fetch geofences");
    }
});
Router.patch("/edit-geofence/:geoid", async (req, res) => {
    const { latitude, longitude, radius, name } = req.body;
    const { geoid } = req.params;
    try {
        await Geofence.updateOne({ _id: geoid }, { latitude, longitude, radius, name });
        res.redirect('/admin-o/show/geofence');
    } catch (err) {
        console.error(`Error while updating: ${err}`);
        res.status(500).send("An error occurred while updating the geofence.");
    }
});


Router.delete("/delete-geofence/:geoid", async (req, res) => {
    const { geoid } = req.params;
    try {
        await Geofence.deleteOne({ _id: geoid });
        res.redirect('/admin-o/show/geofence');
    } catch (err) {
        console.error(`Error while deleting: ${err}`);
        res.status(500).send("An error occurred while deleting the geofence.");
    }
});




Router.get("/show/geofence", async (req, res) => {
    let geo = await axios.post(`${API_BASE_URL}/admin-o/curr-geos`);
    let fence = geo.data;
    res.render("allgeo", { fence });
});




Router.get("/create/geo",(req,res)=>{
    res.render("create-geo")
})




Router.get("/edit/geo/:geoid", async (req, res) => {
    const { geoid } = req.params;
    try {
        const user = await Geofence.findById(geoid);
        res.render("edit-geo", { user });
    } catch (err) {
        console.error('Error fetching geofence:', err);
        res.status(500).send('Server Error');
    }
});

module.exports = Router;