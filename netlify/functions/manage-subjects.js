const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    const method = event.httpMethod;
    const client = new MongoClient(process.env.MONGODB_URI);
    const headers = { "Content-Type": "application/json" };

    try {
        await client.connect();
        const db = client.db('eduflow');
        const col = db.collection('subjects');

        // GET: Semua orang bisa melihat daftar mata kuliah
        if (method === "GET") {
            const subjects = await col.find({}).sort({ name: 1 }).toArray();
            return { statusCode: 200, headers, body: JSON.stringify(subjects) };
        }

        // PROTEKSI ADMIN (POST & DELETE)
        const authHeader = event.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY_ANDA");
        if (decoded.role !== 'admin') return { statusCode: 403, headers, body: "Forbidden" };

        if (method === "POST") {
            const { name } = JSON.parse(event.body);
            await col.insertOne({ name, createdAt: new Date() });
            return { statusCode: 201, headers, body: JSON.stringify({ message: "Mata Kuliah Ditambahkan" }) };
        }

        if (method === "DELETE") {
            const { id } = JSON.parse(event.body);
            await col.deleteOne({ _id: new ObjectId(id) });
            return { statusCode: 200, headers, body: JSON.stringify({ message: "Mata Kuliah Dihapus" }) };
        }

    } catch (e) {
        return { statusCode: 500, headers, body: e.toString() };
    } finally { await client.close(); }
};