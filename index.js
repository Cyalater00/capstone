const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET);
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@soccer-training-program.id0j0.mongodb.net/`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Connect to MongoDB once at the start
async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const database = client.db("soccer-training-program");
    const usersCollection = database.collection("users");
    const classesCollection = database.collection("classes");
    const cartCollection = database.collection("cart");
    const paymentCollection = database.collection("payments");
    const enrolledCollection = database.collection("enrolled");
    const appliedCollection = database.collection("applied");

    // Class routes
    app.post("/new-class", async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get("/classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    //get classes by instructor email
    app.get("/classes/:email", async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // manage classes
    app.get("/classes-manage", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    //update classes status and reason
    app.put("/classes-manage/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const reason = req.body.reason;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: status,
          reason: reason,
        },
      };
      const result = await classesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    //get approved classes
    app.get("/approved-classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    //get class details
    app.get("/class/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(query);
      res.send(result);
    });

    //update class details (all data)
    app.put("/update-class/:id", async (req, res) => {
      const id = req.params.id;
      const updateClass = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: updateClass.name,
          description: updateClass.description,
          price: updateClass.price,
          availableSteats: parseInt(updateClass.availableSteats),
          videoLink: updateClass.videoLink,
          status: "pending",
        },
      };
      const result = await classesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    //cart Routes
    app.post("/add-to-cart", async (req, res) => {
      const newCartItem = req.body;
      const result = await cartCollection.insertOne(newCartItem);
      res.send(result);
    });

    //get cart items by id
    app.get("/cart-item/:id", async (req, res) => {
      const id = req.params.id;
      const email = req.body.email;
      const query = {
        classId: id,
        userMail: email,
      };
      const projection = { classId: 1 };
      const result = await cartCollection.findOne(query, {
        projection: projection,
      });
      res.send(result);
    });

    //cart info by user email
    app.get('/cart/:email', async (req, res) => {
        const email = req.params.email;
        const query = {userMail: email};
        const projection = {classId: 1};
        const carts = await cartCollection.find(query, {projection: projection});
        const classIds = carts.map((cart) => new ObjectId(cart.classId));
        const query2 = {_id: {$in: classIds}};
        const result = await classesCollection.find(query2.toArray());
        res.send(result);
    })

    //delete cart item
    app.delete('/delete-cart-item/:id', async (req, res) => {
        const id = req.params.id;
        const query = {classId: id};
        const result = await cartCollection.deleteOne(query);
        res.send(result);
    });

    //payment routes
    app.post('/create-payment-intent', async (req, res) => {
        const {price} = req.body;
        const amount = parseInt(price) * 100;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount, 
            currency: 'usd',
            payment_method_types: ['card'],

        });
        res.send({clientSecret: paymentIntent.client_secret});

    });

    //post payment info to do
    app.post('/payment-info', async (req, res) => {
        const payment = req.body;
        const classesId = paymentInfo.classId;
        const userEmail = paymentInfo.userEmail;
        const signleClassId = req.query.classId;
        let query;
        if (signleClassId) {
            query = {classId: signleClassId, userMail: userEmail};
            } else {
                query = {classId: {$in:classesId}};
            }
        
        const classQuery = {_id: {$in : classesId.map( id => new ObjectId(id))}};
        const classes = await classesCollection.find(classQuery).toArray();
        const newEnrolledData = {
            userEmail: userEmail,
            classId: signleClassId.map(id => ObjectId(id)),
            transactionId: paymentInfo.transactionId
        };

        const updateDoc = {
            $set: {
                totalEnrolled: classes.reduce((total, current) => total + current.totalEnrolled, 0) + 1 || 0,
                availableSteats: classes.reduce((total, current) => total + current.availableSteats, 0) - 1 || 0,
            }
        }
        const updatedResult = await classesCollection.updateMany(classQuery, updateDoc, {upsert: true});
        const enrolledResult = await enrolledCollection.insertOne(newEnrolledData);
        const deletedResults = await cartCollection.deleteMany(query);
        const paymentResult = await paymentCollection.insertOne(paymentInfo);

        res.send({ paymentResult, deletedResults, enrolledResult, updatedResult});

    });
      

    //get payment history
    app.get("/payment-history/:email", async (req, res) => {
        const email = req.params.email;
        const query = {userEmail: email};
        const result = await paymentCollection.find(query).sort({date: -1}).toArray();
        res.send(result);
    });
    
    //payment history length
    app.get("/payment-history-length/:email", async (req, res) => {
        const email = req.params.email;
        const query = {userEmail: email};
        const result = await paymentCollection.countDocuments(query);
        res.send(total);
    });

    //Enrollment Routes
    app.get("/popular_classes", async(req, res) =>{
        const result = await classesCollection.find().sort({totalEnrolled: -1}).limit(6).toArray();
        res.send(result);
    });

    app.get('/popular-instructions', async(req, res) => {
        const pipeline = [
            {
                $group: {
                    _id: "$instructorEmail",
                    totalEnrolled: { $sum: "$totalEnrolled"}
                }
            },
            {
            $lookup: {
                from: "user",
                localField: "_id",
                foreignField: "email",
                as: "instructor"
            }
            },
            {
                $project: {
                    _id: 0,
                    instructor: {
                        $arrayElemAt: ["$instructor", 0]
                    },
                    totalEnrolled: 1
                }
            },
            {
                $sort: {
                    totalEnrolled: -1
                }
            },
            {
                $limit: 6
            }
        ];
        const result = await classesCollection.aggregate(pipeline).toArray();
        res.send(result);
    });

    // admin status
    app.get("/admin-status", async(req, res) => {
        const approvedClasses = (await classesCollection.find({status: 'aapproved'}).toArray()).length;
        const pendingclasses = (await classesCollection.find({status: 'pending'}).toArray()).length;
        const instructors = ((await userCollection.find({ role: 'instructor'})).toArray()).length;
        const totalClasses = (await classesCollection.find().toArray()).length;
        const totalEnrolled = (await enrolledCollection.find().toArray()).length;

        const result = {
            approvedClasses,
            pendingclasses,
            instructors,
            totalClasses,
            totalEnrolled
        }
        res.send(result);

    });

    //get all instructor
    app.get('/instructors', async (req, res) => {
        const result = await usersCollection.find({role: 'instructor'}).toArray();
        res.send(result);
    });


  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}


// Run the connection function
connectToMongoDB().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World 2025!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// await client.db("admin").command({ ping: 1 });
// console.log("Pinged your deloyment. you successfully connected to MongoDB");
// }finally {

// }
// }
// run().catch(console.dir);