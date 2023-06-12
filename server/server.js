import 'dotenv/config';
import express from 'express';
import errorMiddleware from './lib/error-middleware.js';
import ClientError from './lib/client-error.js';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import argon2 from 'argon2';

// eslint-disable-next-line no-unused-vars -- Remove when used
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const app = express();

// Create paths for static directories
const reactStaticDir = new URL('../client/build', import.meta.url).pathname;
const uploadsStaticDir = new URL('public', import.meta.url).pathname;

app.use(express.static(reactStaticDir));
// Static directory for file uploads server/public/
app.use(express.static(uploadsStaticDir));
app.use(express.json());

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

app.post('/api/auth/sign-up', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new ClientError(400, 'username and password are required fields');
    }
    const hashedPassword = await argon2.hash(password);
    const sql = `insert into "customers" ("username", "hashedPassword")
    values ($1, $2)
    returning
      "customerId",
    "username",
    "createdAt"
  ;
    `;
    const params = [username, hashedPassword];
    const result = await db.query(sql, params);
    const [user] = result.rows;
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/sign-in', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new ClientError(401, 'invalid login');
    }

    /* your code starts here */

    const sql = ` select *
    from "users"
    where "username" = $1
    ;
    `;
    const params = [username];
    const result = await db.query(sql, params);
    if (result.rows === []) {
      throw new Error(401, 'invalid username');
    }
    const hashedPw = result.rows[0].hashedPassword;
    const isMatchingPw = await argon2.verify(hashedPw, password);
    if (!isMatchingPw) throw new Error(401, 'invalid password');
    if (isMatchingPw) {
      const payload = {
        userId: result.rows[0].userId,
        username: result.rows[0].username,
      };
      const token = jwt.sign(payload, process.env.TOKEN_SECRET);
      res.status(200).json({ token, payload });
    }
  } catch (err) {
    next(err);
  }
});
/**
 * Serves React's index.html if no api route matches.
 *
 * Implementation note:
 * When the final project is deployed, this Express server becomes responsible
 * for serving the React files. (In development, the Create React App server does this.)
 * When navigating in the client, if the user refreshes the page, the browser will send
 * the URL to this Express server instead of to React Router.
 * Catching everything that doesn't match a route and serving index.html allows
 * React Router to manage the routing.
 */
app.get('*', (req, res) => res.sendFile(`${reactStaticDir}/index.html`));

app.use(errorMiddleware);

app.listen(process.env.PORT, () => {
  process.stdout.write(`\n\napp listening on port ${process.env.PORT}\n\n`);
});
