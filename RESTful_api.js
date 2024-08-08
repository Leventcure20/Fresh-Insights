import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";

const app = express();
const port = 4000;
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
  });
db.connect();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/posts", async (req, res) => {
  const posts = await db.query("SELECT * FROM posts");
   const result = posts.rows;
   res.json(result);
});


//gets the posts based on the user id.
app.get("/posts/:id", async (req, res) => {
  const user_id = parseInt(req.params.id);

  const post = await db.query("SELECT * FROM posts WHERE id = $1", [user_id]);
  if (post.rows.length > 0) {
    res.json(post.rows);
  } else {
    res.status(404).json({error: `The post with ${user_id} has not been found`});
  }
});




app.post("/posts", async (req, res) => {
  const title = req.body.title;
  const content = req.body.content;
  const date_published = new Date().toISOString();
  
  const id = req.body.id;

  if (!title || !content || !date_published || !id) {
    return res.status(400).json({ error: "All fields (title, content, date_published, user id) are required." });
  }
  
  const post = await db.query("INSERT INTO posts (title, content, date_published, id) VALUES ($1, $2, $3, $4) RETURNING *", 
    [title, content, date_published, id]
  );
  try{
    res.json(post)
  } catch {
    res.status(404).json({error: `The post with ${id} has not been found`});
  }
});

app.put("/posts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const result = await db.query("SELECT * FROM posts WHERE post_id = $1", [id]);

  if (result.rows.length === 0) {
    res.status(404).json({error: `The post with ${id} has not been found.`})
  } 
  const post = result.rows[0];
  const title = req.body.title || post.title;
  const content = req.body.content || post.content;
  const date_published = new Date().toISOString();

  try{
    const new_post = await db.query("UPDATE posts SET title = $1, content = $2, date_published = $3 WHERE post_id = $4 RETURNING *", [title, content, date_published, id]);
    res.json(new_post.rows[0]);
  } catch {
    res.status(404).json({error: `Task was not successful.`});
  }
});


app.delete("/posts/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    await db.query("DELETE FROM posts WHERE post_id = $1", [id]);
    res.status(200).json({success: "Post deleted successfully."})
  } catch {
    res.status(404).json({error: "Task was not successfull"})
  }
});




app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });