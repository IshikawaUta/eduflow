const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    // 1. Validasi Method (Hanya izinkan POST atau PUT)
    if (event.httpMethod !== "POST" && event.httpMethod !== "PUT") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // 2. Verifikasi Token & Role Dosen
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { statusCode: 401, body: JSON.stringify({ message: "Sesi tidak valid." }) };
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY_ANDA");
        if (decoded.role !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ message: "Akses ditolak. Khusus Dosen." }) };
        }
    } catch (err) {
        return { statusCode: 401, body: JSON.stringify({ message: "Token kadaluarsa." }) };
    }

    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        const { submissionId, grade, feedback } = JSON.parse(event.body);

        if (!submissionId || grade === undefined) {
            return { statusCode: 400, body: JSON.stringify({ message: "ID Tugas dan Nilai harus diisi." }) };
        }

        await client.connect();
        const db = client.db('eduflow');

        // 3. Update Nilai dan Feedback
        const result = await db.collection('assignments').updateOne(
            { _id: new ObjectId(submissionId) },
            { 
                $set: { 
                    grade: grade, 
                    feedback: feedback || "",
                    gradedAt: new Date(), // Menambah info kapan dinilai
                    status: "Dinilai" // Update status pengumpulan
                } 
            }
        );

        if (result.matchedCount === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: "Data pengumpulan tidak ditemukan." }) };
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Nilai berhasil disimpan. Status tugas mahasiswa kini Terkunci." })
        };

    } catch (error) {
        console.error("Grading Error:", error);
        return { statusCode: 500, body: JSON.stringify({ message: "Gagal menyimpan nilai." }) };
    } finally {
        await client.close();
    }
};