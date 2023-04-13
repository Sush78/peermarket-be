import { Server } from "socket.io";
import bodyParser from 'body-parser';
import cors from 'cors';
import * as dotenv from 'dotenv'
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb'

dotenv.config()
const obj = { true: 1, false: 1 }

const app = express()

const CONNECTION_URL = `mongodb+srv://${process.env.DB_UNAME}:${process.env.DB_PASS}@cluster0.wtfw7u3.mongodb.net/?retryWrites=true&w=majority`
const PORT = process.env.PORT || 9000
let db = null

app.use(bodyParser.json({limit: "30mb", extended: true}))
app.use(bodyParser.urlencoded({limit: "30mb", extended: true}))
app.use(cors())

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
  res.status(200).json(poolData)
});

app.post('/bets/place-bet', async(req, res) => {
  const body = req.body
  let coll = await db.collection("bets")
  const {poolId, direction, stakeAmount, result, playerAddress} = body
  // trigger smart contract
  const poolData = await coll.insertOne({poolId, direction, stakeAmount, result, playerAddress})
  res.status(201).json(poolData)
});

app.listen(PORT, async (req,res) => {
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

// const io = new Server(httpServer, {
//   cors: {
//     origin: '*'
//   }
// })

// io.on('connection', (socket) => {

//   setInterval(() => {
//     const betValue = Math.random() < 0.5
//     if (!obj[betValue]) obj[betValue] = 1; else obj[betValue] = obj[betValue] + 1;

//     console.log(obj)
//     socket.emit('welcome', obj)

//   }, 2000);

//   // socket.emit('welcome', 'welcome to PeerMarket')


//   socket.on('msg', (data) => {
//     console.log('msg from client =>', data)
//   })
// })