require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const path = require("path");

// ===== TEMP DATABASE =====
const userOrders = {};

const app = express();

app.use(cors());
app.use(express.json());

// ===== SESSION SETUP =====
app.use(session({
    secret: "hilldash_secret",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// ===== GOOGLE PASSPORT CONFIG =====
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
},
(accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ===== AUTH ROUTES =====

// Start Google login
app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google callback
app.get("/auth/google/callback",
    passport.authenticate("google", {
        failureRedirect: "/"
    }),
    (req, res) => {
        res.redirect("/profile.html");
    }
);

// Logout
app.get("/logout", (req, res) => {
    req.logout(() => {
        res.redirect("/");
    });
});

// Middleware to protect profile
function ensureAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect("/");
}

// Serve static files (IMPORTANT)
app.use(express.static(path.join(__dirname)));

// ===== PROTECTED PROFILE ROUTE =====
app.get("/profile.html", ensureAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "profile.html"));
});

// ===== EMAIL ENDPOINT (UNCHANGED) =====
app.post("/send-order-email", async (req, res) => {
    const order = req.body;

    const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: '"Hilldash Orders" <orders@hilldash.com>',
        to: order.deliveryCompanyEmail,
        subject: `New Order Received – ${order.reference}`,
        text: `
Hello Delivery Team,

You have a new order to fulfill.

Order Details:
- Reference: ${order.reference}
- Customer Name: ${order.customerName}
- Email: ${order.email}
- Delivery Address: ${order.address}
- Items:
${order.items.map(i => `   - ${i.name} x${i.quantity}`).join("\n")}

Payment Status: Paid

Please confirm receipt of this order.

Thank you,
Hilldash
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Email sent successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Failed to send email" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Save order to user's history
if (req.user) {
    const userEmail = req.user.emails[0].value;

    if (!userOrders[userEmail]) {
        userOrders[userEmail] = [];
    }

    userOrders[userEmail].push({
        reference: order.reference,
        items: order.items,
        status: "Pending",
        date: new Date()
    });
}

// ===== GET USER ORDERS =====
app.get("/api/my-orders", ensureAuth, (req, res) => {

    const userEmail = req.user.emails[0].value;
    const orders = userOrders[userEmail] || [];

    res.json(orders);
});

// ===== GET CURRENT USER =====
app.get("/api/me", ensureAuth, (req, res) => {
    res.json({
        name: req.user.displayName,
        email: req.user.emails[0].value,
        avatar: req.user.photos[0].value
    });
});