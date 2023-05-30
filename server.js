import { Server } from "socket.io";
import { createServer } from 'http'
import bodyParser from 'body-parser';
import cors from 'cors';
import * as dotenv from 'dotenv'
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb'
import https from 'https';
import * as fs from "fs";

dotenv.config()

const app = express()

const CONNECTION_URL = `mongodb+srv://appUser:peermarket@cluster0.wtfw7u3.mongodb.net/?retryWrites=true&w=majority`
const PORT = process.env.PORT || 9000
let db = null

app.use(bodyParser.json({ limit: "30mb", extended: true }))
app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }))
app.use(cors())

const server = createServer(app);

app.get('/api/bets/get-bets/:id', async (req, res) => {
  const _id = req.params.id
  let coll = await db.collection("bets")
  const poolData = await coll.findOne({ poolId: parseInt(_id) })
  res.status(200).json(poolData)
});

app.get('/api/pools/get-top-pools', async (req, res) => {
  if (!db) {
    console.error("Data base is not connected")
  }
  let coll = await db.collection("pools")
  const poolData = await coll.find()
  let poolRes = []
  await poolData.forEach(element => {
    poolRes.push(element)
  });
  res.status(200).json(poolRes)
});

app.get('/api/pools/get-pool/:id', async (req, res) => {
  const _id = req.params.id
  let coll = await db.collection("pools")
  const poolData = await coll.findOne({ "_id": new ObjectId(_id) })
  let col3 = await db.collection("testPool")
  const query = { 'metaDeta.poolId': _id, "metaDeta.direction": { "$in": ["0", "1"] } };
  const options = {
    sort: { timestamp: 1 }, // Sort by timestamp in ascending order
    projection: { timestamp: 1, amount: 1, 'metaDeta.direction': 1 } // Only fetch timestamp and amount fields
  };
  const timeSeriesData = await col3.find(query, options).toArray();
  console.log(timeSeriesData)
  const firstPct = (poolData.stats["0"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
  const secondPct = (poolData.stats["1"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
  const labels = [poolData.resultMap["0"], poolData.resultMap["1"]]
  const data = [firstPct.toFixed(2), secondPct.toFixed(2)]
  const totalVolume = poolData.stats["0"] + poolData.stats["1"]
  const graphData = [];
  for (const data of timeSeriesData) {
    const key = `${data.timestamp}-${data.metaDeta.direction}`;
    const value = data.amount;
    const existingData = graphData.find(d => Object.keys(d)[0] === key);
    if (existingData) {
      existingData[key].push(value);
    } else {
      graphData.push({ [key]: [value] });
    }
  }
  console.log({ labels, data, totalVolume, graphData })
  res.status(200).json({ poolData, labels, data, totalVolume, graphData })
});

app.post('/api/bets/place-bet', async (req, res) => {
  const body = req.body
  let coll = await db.collection("bets")
  const { poolId, direction, stakeAmount, result, playerAddress } = body
  // trigger smart contract
  const poolData = await coll.insertOne({ poolId, direction, stakeAmount, result, playerAddress })
  await collection.insertOne({
    timestamp: new Date(),
    metaDeta: { poolId: poolId, direction: direction },
    amount: stakeAmount
  });
  res.status(201).json(poolData)
});

app.get('/api/bet/get-bet-image/:id', async(req, res) => {
  const text = req.params.id; // Text input
  const access_key = 'GOJsuiXyp5pabu2DI_3GDE5KlkgjFh0HKGwrlQ89xYU'; // Replace with your Unsplash access key

  https.get(`https://api.unsplash.com/photos/random?query=${text}&client_id=${access_key}`, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      const image_url = JSON.parse(data).urls.regular;
      https.get(image_url, (res) => {
        const file = fs.createWriteStream('image.png');
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Image saved to file');
        });
      });
    });
  });
  res.status(200)
});

app.get('/api/notification/getNotifications/:playerAddress', async (req, res) => {
  let coll = await db.collection("notifications")
  const notificationData = await coll.find({'playerAddress': req.params.playerAddress}).toArray()
  res.status(200).json(notificationData)
});

app.post('/api/notification/addNotification', async (req, res) => {
  const body = req.body
  let coll = await db.collection("notifications")
  const { poolId, playerAddress, notificationDetails, notificationTitle, status } = body
  const notificationData = await coll.insertOne({ poolId, playerAddress, notificationDetails, notificationTitle, status })
  res.status(201).json(notificationData)
});

app.put('/api/notification/updateNotification/:notification', async (req, res) => {
  const body = req.body
  let coll = await db.collection("notifications")
  const { _id, pool_id, player_address, notification_text, notification_title, status } = body
  const poolData = await coll.updateOne(
    {
        notification_text: notification_text,
        notification_title: notification_title,
        playerAddress: player_address,
        status: status,
        poolId: new ObjectId(pool_id)
      }
  );
  res.status(201).json(poolData)
});

app.post('/api/notification/addNotification/:notification', async (req, res) => {
  const body = req.body
  let coll = await db.collection("notifications")
  const { _id, pool_id, player_address, notification_text, notification_title, status } = body
  const poolData = await coll.insertOne({pool_id,status,notification_title,player_address,notification_text});
  res.status(201).json(poolData)
});


server.listen(PORT, async (req, res) => {
  const client = new MongoClient(CONNECTION_URL);
  try {
    // Connect to the MongoDB cluster
    const conn = await client.connect();
    db = conn.db("peermarket")

    console.log("Database Connected")
  } catch (e) {
    console.error(e);
  }
  console.log(`Server Started on port: ${PORT}`)
})

// Socket Config for live data feed
const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

io.on('connection', (socket) => {
  console.log('New WebSocket connection');

  // Listen for new posts from any connected client
  socket.on('newBet', async (betDetails) => {
    const { poolId, choice, amount, currentAccount } = betDetails
    // update bets collection
    let coll = await db.collection("bets")
    await coll.insertOne({ poolId: new ObjectId(poolId), direction: choice, stakeAmount: amount, result: "NA", playerAddress: currentAccount })
    let coll2 = await db.collection("pools")
    let col3 = await db.collection("testPool")
    await col3.insertOne({
      timestamp: new Date(),
      metaDeta: { poolId: poolId, direction: choice },
      amount: amount
    });
    // update pool stats
    const collName = `stats.${choice}`
    if (choice === "1") {
      await coll2.updateOne(
        { "_id": new ObjectId(poolId) },
        { $inc: { "stats.1": amount } }
      )
    } else {
      await coll2.updateOne(
        { "_id": new ObjectId(poolId) },
        { $inc: { "stats.0": amount } }
      )
    }
    const poolData = await coll2.findOne({ "_id": new ObjectId(poolId) })
    const query = { 'metaDeta.poolId': poolId, "metaDeta.direction": { "$in": ["0", "1"] } };
    const options = {
      sort: { timestamp: 1 }, // Sort by timestamp in ascending order
      projection: { timestamp: 1, amount: 1, 'metaDeta.direction': 1 } // Only fetch timestamp and amount fields
    };
    const timeSeriesData = await col3.find(query, options).toArray();
    const firstPct = (poolData.stats["0"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
    const secondPct = (poolData.stats["1"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
    const labels = [poolData.resultMap["0"], poolData.resultMap["1"]]
    const data = [firstPct.toFixed(2), secondPct.toFixed(2)]
    const totalVolume = poolData.stats["0"] + poolData.stats["1"]
    const graphData = [];
    for (const data of timeSeriesData) {
      const key = `${data.timestamp}-${data.metaDeta.direction}`;
      const value = data.amount;
      const existingData = graphData.find(d => Object.keys(d)[0] === key);
      if (existingData) {
        existingData[key].push(value);
      } else {
        graphData.push({ [key]: [value] });
      }
    }
    console.log({ labels, data, totalVolume, graphData })
    io.emit('newBet', { labels, data, totalVolume, poolId, graphData });

  });
});