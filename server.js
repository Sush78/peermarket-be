import { Server } from "socket.io";
import { createServer } from 'http'
import bodyParser from 'body-parser';
import cors from 'cors';
import * as dotenv from 'dotenv'
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb'

dotenv.config()

const app = express()

const CONNECTION_URL = `mongodb+srv://${process.env.DB_UNAME}:${process.env.DB_PASS}@cluster0.wtfw7u3.mongodb.net/?retryWrites=true&w=majority`
const PORT = process.env.PORT || 9000
let db = null

app.use(bodyParser.json({limit: "30mb", extended: true}))
app.use(bodyParser.urlencoded({limit: "30mb", extended: true}))
app.use(cors())

const server = createServer(app);

app.get('/bets/get-bets/:id', async(req, res) => {
  const _id = req.params.id
  let coll = await db.collection("bets")
  const poolData = await coll.findOne({ poolId: parseInt(_id) })
  res.status(200).json(poolData)
});


app.get('/pools/get-top-pools', async(req, res) => {
  let coll = await db.collection("pools")
  const poolData = await coll.find()
  let poolRes = []
  await poolData.forEach(element => {
    poolRes.push(element)
  });
  res.status(200).json(poolRes)
});

app.get('/pools/get-pool/:id', async(req, res) => {
  const _id = req.params.id
  let coll = await db.collection("pools")
  const poolData = await coll.findOne({ "_id": new ObjectId(_id) })
  const firstPct = (poolData.stats["0"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
  const secondPct = (poolData.stats["1"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
  const labels = [poolData.resultMap["0"], poolData.resultMap["1"]]
  const data = [firstPct.toFixed(2), secondPct.toFixed(2)]
  const totalVolume = poolData.stats["0"] + poolData.stats["1"]
  res.status(200).json({poolData, labels, data, totalVolume})
});

app.post('/bets/place-bet', async(req, res) => {
  const body = req.body
  let coll = await db.collection("bets")
  const {poolId, direction, stakeAmount, result, playerAddress} = body
  // trigger smart contract
  const poolData = await coll.insertOne({poolId, direction, stakeAmount, result, playerAddress})
  res.status(201).json(poolData)
});

server.listen(PORT, async (req,res) => {
  const client = new MongoClient(CONNECTION_URL);
  try {
      // Connect to the MongoDB cluster
      const conn = await client.connect();
      db = conn.db("peermarket")
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
  socket.on('newBet', async(betDetails) => {
    const {poolId, choice, amount, currentAccount} = betDetails
    // update bets collection
    let coll = await db.collection("bets")
    await coll.insertOne({poolId: new ObjectId(poolId), direction: choice, stakeAmount: amount, result: "NA",  playerAddress: currentAccount})
    let coll2 = await db.collection("pools")
    // update pool stats
    const collName = `stats.${choice}`
    if(choice === "1"){
      await coll2.updateOne(
          { "_id": new ObjectId(poolId) },
          { $inc: { "stats.1" : amount } }
      )
    } else {
      await coll2.updateOne(
          { "_id": new ObjectId(poolId) },
          { $inc: { "stats.0" : amount } }
      )
    }
    const poolData = await coll2.findOne({"_id": new ObjectId(poolId)})
    const firstPct = (poolData.stats["0"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
    const secondPct = (poolData.stats["1"] / (poolData.stats["0"] + poolData.stats["1"])) * 100
    const labels = [poolData.resultMap["0"], poolData.resultMap["1"]]
    const data = [firstPct.toFixed(2), secondPct.toFixed(2)]
    const totalVolume = poolData.stats["0"] + poolData.stats["1"]
    // Broadcast the new post to all connected clients
    io.emit('newBet', {labels, data, totalVolume});
  });
});