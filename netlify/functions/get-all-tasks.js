const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    // 1. Ambil Token dari Header Authorization
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { 
            statusCode: 401, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Sesi tidak ditemukan." }) 
        };
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
        // 2. Verifikasi JWT & Cek Role Admin (Dosen)
        decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY_ANDA");
        
        if (decoded.role !== 'admin') {
            return { 
                statusCode: 403, 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Akses Ditolak. Anda bukan Dosen." }) 
            };
        }
    } catch (err) {
        return { 
            statusCode: 401, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Token tidak valid atau kadaluarsa." }) 
        };
    }

    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        const db = client.db('eduflow');

        // 3. Ambil seluruh data pengumpulan
        const assignments = await db.collection('assignments')
            .find({})
            .sort({ submittedAt: -1 })
            .toArray();

        // 4. Ambil data tugas untuk mendapatkan info deadline terbaru
        const tasks = await db.collection('tasks').find({}, { projection: { title: 1, deadline: 1 } }).toArray();

        // 5. Gabungkan info deadline ke setiap pengumpulan
        // Ini membantu dosen melihat deadline asli saat memberikan nilai
        const enrichedData = assignments.map(asg => {
            const taskInfo = tasks.find(t => t.title === asg.taskTitle);
            return {
                ...asg,
                taskDeadline: taskInfo ? taskInfo.deadline : null
            };
        });

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-cache" 
            },
            body: JSON.stringify(enrichedData)
        };
    } catch (error) {
        console.error("Dosen Fetch Error:", error);
        return { 
            statusCode: 500, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Kesalahan server database." }) 
        };
    } finally {
        await client.close();
    }
};