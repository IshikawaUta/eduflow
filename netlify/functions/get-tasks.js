const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    // 1. Verifikasi Token JWT
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { 
            statusCode: 401, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Sesi berakhir, silakan login kembali." }) 
        };
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY_ANDA");
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
        
        const userEmail = decoded.email.toLowerCase().trim();

        // 2. Ambil Riwayat Pengumpulan Mahasiswa
        const submissions = await db.collection('assignments')
            .find({ student: userEmail }) 
            .sort({ submittedAt: -1 })
            .toArray();

        // 3. Ambil data deadline dari koleksi 'tasks' untuk pengecekan di frontend
        // Ini agar frontend tahu apakah tugas masih boleh dihapus/edit atau tidak
        const tasksInfo = await db.collection('tasks').find({}, { projection: { title: 1, deadline: 1 } }).toArray();
        
        // Gabungkan data deadline ke dalam hasil pengumpulan
        const enrichedSubmissions = submissions.map(sub => {
            const matchTask = tasksInfo.find(t => t.title === sub.taskTitle);
            return {
                ...sub,
                deadline: matchTask ? matchTask.deadline : null,
                // Server-side check: Apakah sudah telat untuk dihapus?
                isPastDeadline: matchTask ? (new Date() > new Date(matchTask.deadline)) : false
            };
        });

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            },
            body: JSON.stringify(enrichedSubmissions)
        };
    } catch (error) {
        console.error("Fetch Tasks Error:", error);
        return { 
            statusCode: 500, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Gagal memuat riwayat tugas." }) 
        };
    } finally {
        await client.close();
    }
};