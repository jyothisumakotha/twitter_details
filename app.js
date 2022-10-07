const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
let loggedInUserName = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const selectUserQuery = `SELECT * FROM user WHERE username = '${request.body.username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (request.body.password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(request.body.password, 10);
      const createUserQuery = `INSERT INTO user (username,password,name, gender) 
         VALUES ('${request.body.username}','${hashedPassword}','${request.body.name}','${request.body.gender}');`;
      const dbResponse = await db.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const payload = { username: request.body.username };
  loggedInUserName = request.body.username;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${request.body.username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      request.body.password,
      dbUser.password
    );
    if (isPasswordMatched === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const jwtToken = jwt.sign(payload, "yvyyctf");
      response.send({ jwtToken });
    }
  }
});

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "yvyyctf", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}
const convertResultToObject = (user) => {
  return {
    username: user.username,
    tweet: user.tweet,
    dateTime: user.date_time,
  };
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const authHeader = request.headers["authorization"];
  if (authHeader.split(" ")[1] !== undefined) {
    const getQuery = `SELECT user.username,tweet.tweet,tweet.date_time 
    FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
    INNER JOIN user 
    ON tweet.user_id = user.user_id
    WHERE follower.follower_user_id IN (SELECT user_id from user WHERE username='${loggedInUserName}')
    ORDER BY tweet.date_time DESC
    LIMIT 4
    OFFSET 0;`;
    const data = await db.all(getQuery);
    const res = [];
    for (let user of data) {
      const output = convertResultToObject(user);
      res.push(output);
    }
    response.send(res);
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const authHeader = request.headers["authorization"];
  if (authHeader.split(" ")[1] !== undefined) {
    const getQuery = `SELECT user.name FROM user WHERE user_id IN 
    (SELECT following_user_id  
    FROM user INNER JOIN follower 
    WHERE user.user_id = follower_user_id 
    and user.username = '${loggedInUserName}');`;
    const data = await db.all(getQuery);
    response.send(data);
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const authHeader = request.headers["authorization"];
  if (authHeader.split(" ")[1] !== undefined) {
    const getQuery = `SELECT user.name FROM user WHERE user_id IN 
    (SELECT follower_user_id  
    FROM user INNER JOIN follower 
    WHERE user.user_id = following_user_id 
    and user.username = '${loggedInUserName}');`;
    const data = await db.all(getQuery);
    response.send(data);
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const authHeader = request.headers["authorization"];
  if (authHeader.split(" ")[1] !== undefined) {
    const getQuery = `SELECT tweet_id FROM tweet WHERE user_id IN(
        SELECT user.user_id FROM user WHERE user_id IN (SELECT following_user_id FROM user INNER JOIN follower 
            WHERE user.user_id = follower_user_id 
            AND user.username = '${loggedInUserName}'));`;
    const data = await db.all(getQuery);
    const tweetIds = [];
    for (let id of data) {
      res = id.tweet_id;
      tweetIds.push(res);
    }
    if (tweetIds.includes(parseInt(request.params.tweetId))) {
      const resultQuery = `SELECT COUNT(like_id) AS likes FROM like WHERE like.tweet_id=${request.params.tweetId};`;
      const data = await db.get(resultQuery);
      const replyQuery = `SELECT COUNT(reply_id) AS replies FROM reply WHERE reply.tweet_id=${request.params.tweetId};`;
      const resultt = await db.get(replyQuery);
      const tweetDateTimeQuery = `SELECT tweet,date_time FROM tweet WHERE tweet_id=${request.params.tweetId};`;
      const d = await db.get(tweetDateTimeQuery);
      response.send({
        tweet: d.tweet,
        likes: data.likes,
        replies: resultt.replies,
        dateTime: d.date_time,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const authHeader = request.headers["authorization"];
    if (authHeader.split(" ")[1] !== undefined) {
      const getQuery = `SELECT tweet_id FROM tweet WHERE user_id IN(
        SELECT user.user_id FROM user WHERE user_id IN (SELECT following_user_id FROM user INNER JOIN follower 
            WHERE user.user_id = follower_user_id 
            AND user.username = '${loggedInUserName}'));`;
      const data = await db.all(getQuery);
      const tweetIds = [];
      for (let id of data) {
        res = id.tweet_id;
        tweetIds.push(res);
      }
      if (tweetIds.includes(parseInt(request.params.tweetId))) {
        const resultQuery = `SELECT username FROM user WHERE user_id IN(
        SELECT user_id FROM like WHERE tweet_id=3);`;
        const data = await db.all(resultQuery);
        const res = [];
        for (let user of data) {
          const output = user.username;
          res.push(output);
        }
        response.send({
          likes: res,
        });
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    } else {
      response.status(401);
      response.send("Invalid JWT Token");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const authHeader = request.headers["authorization"];
    if (authHeader.split(" ")[1] !== undefined) {
      const getQuery = `SELECT tweet_id FROM tweet WHERE user_id IN(
        SELECT user.user_id FROM user WHERE user_id IN (SELECT following_user_id FROM user INNER JOIN follower 
            WHERE user.user_id = follower_user_id 
            AND user.username = '${loggedInUserName}'));`;
      const data = await db.all(getQuery);
      const tweetIds = [];
      for (let id of data) {
        res = id.tweet_id;
        tweetIds.push(res);
      }
      if (tweetIds.includes(parseInt(request.params.tweetId))) {
        const resultQuery = `SELECT username FROM user WHERE user_id IN(
        SELECT user_id FROM like WHERE tweet_id=3);`;
        const data = await db.all(resultQuery);
        const res = [];
        for (let user of data) {
          const output = user.username;
          res.push(output);
        }
        response.send({
          likes: res,
        });
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    } else {
      response.status(401);
      response.send("Invalid JWT Token");
    }
  }
);

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const authHeader = request.headers["authorization"];
  if (authHeader.split(" ")[1] !== undefined) {
    const createTweetQuery = `INSERT INTO tweet(tweet) VALUES('${request.body.tweet}');`;
    const data = await db.run(createTweetQuery);
    response.send("Created a Tweet");
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
});

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const authHeader = request.headers["authorization"];
  if (authHeader.split(" ")[1] !== undefined) {
    const tweetsQuery = `select tweet.tweet,tweet.date_time, count(distinct(like.like_id)) AS likes, count(distinct(reply.reply_id)) AS replies from user,tweet,like, reply 
where user.user_id = tweet.user_id 
and tweet.tweet_id = like.tweet_id
and tweet.tweet_id = reply.tweet_id
and user.username='${loggedInUserName}';`;
    const data = await db.all(tweetsQuery);
    const output = [];
    for (let tweet of data) {
      const res = {
        tweet: tweet.tweet,
        likes: tweet.likes,
        replies: tweet.replies,
        dateTime: tweet.date_time,
      };
      output.push(res);
    }
    response.send(output);
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const authHeader = request.headers["authorization"];
    if (authHeader.split(" ")[1] !== undefined) {
      const getQuery = `SELECT * FROM tweet WHERE tweet_id=${request.params.tweetId} AND tweet.user_id=(SELECT user_id FROM user WHERE username='${loggedInUserName}');`;
      const data = await db.get(getQuery);
      if (data !== undefined) {
        const deleteQuery = `DELETE FROM tweet
       WHERE tweet.tweet_id=${request.params.tweetId} AND tweet.user_id=(SELECT user_id FROM user WHERE username='${loggedInUserName}');`;
        const data = await db.run(deleteQuery);
        response.send("Tweet Removed");
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    } else {
      response.status(401);
      response.send("Invalid JWT Token");
    }
  }
);

module.exports = app;
