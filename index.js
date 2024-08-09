import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcryptjs";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";
import axios from "axios";

const app = express();
const port = 3000;
const saltRounds = 10;
const api = "http://localhost:4000";
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
  }
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/dashboard", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("dashboard.ejs")
  } else {
    res.redirect("/")
  }
});

app.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"],
}));

app.get("/auth/google/dashboard",passport.authenticate("google", {
  successRedirect: "/dashboard",
  failureRedirect: "/login",
}))

app.get("/homepage", async (req, res) => {
  console.log(req.user);
  if (req.isAuthenticated()) {
    const user_id = req.user.id;
    const email = req.user.email;
    
    const response = await db.query("SELECT posts.post_id, posts.title, posts.content, posts.date_published, users.email, posts.id FROM posts INNER JOIN users ON posts.id = users.id;");
    const result = response.rows;

    result.forEach(post => {
      post.date_published = new Date(post.date_published).toISOString().split('T')[0]; // YYYY-MM-DD format
    });

    const ownedPosts = result.filter(post => post.id === user_id);
    const otherPosts = result.filter(post => post.id !== user_id);


    res.render("homepage.ejs", {ownedPosts: ownedPosts, otherPosts: otherPosts, username: email});
  } else {
    res.redirect("/")
  }
});



app.get("/new", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("new_post.ejs")
  } else {
    res.redirect("/")
  }
});


app.get("/home", (req, res) => {
  try {
    res.render("home.ejs")
  } catch (err) {
    res.status(404).json({error: "Bad request."})
  }
});

app.post("/new", async (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.user.id;
    const title = req.body.title;
    const content = req.body.content;
      try {
        const response = await axios.post(`${api}/posts`, {title, content, id});
        res.redirect("/homepage");
      } catch (error) {
        res.status(500).json({error: "Failed to create post."})
      }
  } else {
    res.redirect("/");
  }
});

app.get("/my-posts", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const id = req.user.id;
      const response = await axios.get(`${api}/posts/${id}`);
      const posts = response.data;
      res.render("my_posts.ejs", {posts: posts})
    } catch (error) {
      res.render("my_posts.ejs", ({error: "No posts found."}))
    }
  } else {
    res.redirect("/");
  }
});


app.get("/edit", async (req, res) => {
  if (req.isAuthenticated()) {
    const id = req.user.id;
    const response = await axios.get(`${api}/posts/${id}`);
    const post = response.data[0];
    res.render("edit.ejs", {post: post})
  } else {
    res.redirect("/")
  }
});

app.post("/edit/:id", async (req, res) => {
  try {
    const post_id = parseInt(req.params.id)
    const title = req.body.title
    const content = req.body.content
    const result = await axios.put(`${api}/posts/${post_id}`, {title, content});
    
    res.redirect("/my-posts");
  } catch (error) {
    res.status(500).json({error: "An error occurred while making your post."})
  }
});


//deletes the blog from the home page
app.post("/homepage/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await axios.delete(`${api}/posts/${id}`);
    res.redirect("/homepage");
  } catch (error) {
    res.status(500).json({error: "Failed to delete post."})
  }
});


//deletes the blogs from the "my posts" section
app.post("/my-posts/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await axios.delete(`${api}/posts/${id}`);
    res.redirect("/my-posts");
  } catch (error) {
    res.status(500).json({error: "Failed to delete post."})
  }
});


//logs the user out and ends the session
app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err); // Handle the error if needed
    }
    req.session.destroy((err) => {
      if (err) {
        return next(err); // Handle the error if needed
      }
      res.redirect("/"); // Redirect to home page or login page
    });
  });
});


app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;
  const confirm_password = req.body.confirm_password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.render("register.ejs", {error: "Account already exists, try logging in."})
    } else {
      if (password !== confirm_password) {
        res.render("register.ejs", {error: "Passwords do not match."})
      } else {
        //hashing the password and saving it in the database
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          console.log("Hashed Password:", hash);
          const result = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
            [email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log(err);
            res.redirect("/login")
          })
        }
      });
      } 
    }
  } catch (err) {
    console.log(err);
  }
});


app.post("/login", passport.authenticate("local", {
  successRedirect: "/dashboard",
  failureRedirect: "/login",
}));


passport.use("local", 
  new Strategy(async function verify(username, password, cb) {

  console.log(username);

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      username,
    ]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const storedHashedPassword = user.password;
      bcrypt.compare(password, storedHashedPassword, (err, result) => {
        if (err) {
          return cb(err)
        } else {
          if (result) {
            return cb(null, user)
          } else {
            return cb(null, false)
          }
        }
      });
    } else {
      return cb("User not found.");
    }
  } catch (err) {
    return cb(err);
  }
}));

passport.use("google", new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/dashboard",
  userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
}, async (accessToken, refreshToken, profile, cb) => {
  console.log(profile);
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [profile.email])
    if (result.rows.length === 0) {
      const newUser = await db.query("INSERT INTO users (email, password) VALUES ($1, $2)", [profile.email, profile.id])
      cb(null, newUser.rows[0])
    } else {
      //Already have the existing user
      cb(null, result.rows[0]);
    }
  } catch (err) {
    cb(err);
  }
}));


passport.serializeUser((user, cb) => {
  cb(null, user);
});


passport.deserializeUser((user, cb) => {
  cb(null, user);
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

