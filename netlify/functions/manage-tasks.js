const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    const method = event.httpMethod;
    const client = new MongoClient(process.env.MONGODB_URI);
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    try {
        await client.connect();
        const db = client.db('eduflow');
        const collection = db.collection('tasks');

        // 1. GET: Ambil tugas
        if (method === "GET") {
            const id = event.queryStringParameters ? event.queryStringParameters.id : null;
            
            if (id) {
                const task = await collection.findOne({ _id: new ObjectId(id) });
                if (!task) return { statusCode: 404, headers, body: JSON.stringify({ message: "Tugas tidak ditemukan" }) };
                return { statusCode: 200, headers, body: JSON.stringify(task) };
            }

            const tasks = await collection.find({}).sort({ createdAt: -1 }).toArray();
            return { statusCode: 200, headers, body: JSON.stringify(tasks) };
        }

        // 2. VERIFIKASI JWT
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: JSON.stringify({ message: "Sesi tidak valid." }) };
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY_ANDA");
        } catch (err) {
            return { statusCode: 401, headers, body: JSON.stringify({ message: "Token Invalid." }) };
        }

        if (decoded.role !== 'admin') {
            return { statusCode: 403, headers, body: JSON.stringify({ message: "Akses ditolak." }) };
        }

        const data = JSON.parse(event.body || "{}");

        // --- CRUD OPERATIONS ---

        // POST: Buat Tugas Baru (DENGAN SUBJECT)
        if (method === "POST") {
            const result = await collection.insertOne({ 
                title: data.title,
                subject: data.subject || "Umum", // <--- Field Baru
                deadline: data.deadline,
                description: data.description || "",
                imageUrl: data.imageUrl || "",
                createdAt: new Date() 
            });
            return { statusCode: 201, headers, body: JSON.stringify({ message: "Tugas Berhasil Dibuat", id: result.insertedId }) };
        }

        // PUT: Update Tugas (DENGAN SUBJECT)
        if (method === "PUT") {
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ message: "ID diperlukan." }) };
            
            const { id, ...updateData } = data;
            delete updateData._id; 

            await collection.updateOne(
                { _id: new ObjectId(id) }, 
                { $set: { ...updateData, updatedAt: new Date() } }
            );
            return { statusCode: 200, headers, body: JSON.stringify({ message: "Tugas Berhasil Diupdate" }) };
        }

        // DELETE: Hapus Tugas
        if (method === "DELETE") {
            const id = data.id || (event.queryStringParameters ? event.queryStringParameters.id : null);
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ message: "ID diperlukan." }) };

            await collection.deleteOne({ _id: new ObjectId(id) });
            return { statusCode: 200, headers, body: JSON.stringify({ message: "Tugas Berhasil Dihapus" }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ message: "Method Not Allowed" }) };

    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ message: "Error", error: e.toString() }) };
    } finally { 
        await client.close(); 
    }
};