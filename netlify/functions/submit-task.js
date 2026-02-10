const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    // 1. Validasi Auth Header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { statusCode: 401, body: JSON.stringify({ message: "Sesi tidak valid." }) };
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY_ANDA");
    } catch (err) {
        return { statusCode: 401, body: JSON.stringify({ message: "Token tidak valid." }) };
    }

    const client = new MongoClient(process.env.MONGODB_URI);
    
    try {
        await client.connect();
        const db = client.db('eduflow');

        // --- FITUR: KIRIM TUGAS (POST) ---
        if (event.httpMethod === "POST") {
            const data = JSON.parse(event.body);
            
            // 1. CEK APAKAH SUDAH PERNAH MENGUMPULKAN
            const existingSubmission = await db.collection('assignments').findOne({
                student: decoded.email,
                taskTitle: data.title
            });

            if (existingSubmission) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ 
                        message: "Gagal: Anda sudah mengumpulkan tugas ini sebelumnya. Hapus kiriman lama jika ingin mengganti file." 
                    })
                };
            }

            // 2. Cek Info Tugas untuk Deadline
            const taskInfo = await db.collection('tasks').findOne({ title: data.title });
            let isLate = false;
            if (taskInfo && taskInfo.deadline) {
                isLate = new Date() > new Date(taskInfo.deadline);
            }

            const newTask = {
                student: decoded.email,      
                studentName: decoded.name,    
                taskTitle: data.title,
                fileUrl: data.fileUrl,
                submittedAt: new Date(),
                grade: null,
                feedback: "",
                isLate: isLate,
                status: "Selesai"
            };

            await db.collection('assignments').insertOne(newTask);
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Berhasil dikirim!" })
            };
        }

        // --- FITUR: HAPUS PENGUMPULAN (DELETE) ---
        if (event.httpMethod === "DELETE") {
            const submissionId = event.queryStringParameters.id;
            if (!submissionId) {
                return { statusCode: 400, body: JSON.stringify({ message: "ID diperlukan." }) };
            }

            const submission = await db.collection('assignments').findOne({
                _id: new ObjectId(submissionId),
                student: decoded.email 
            });

            if (!submission) {
                return { statusCode: 404, body: JSON.stringify({ message: "Data tidak ditemukan." }) };
            }

            // Aturan 1: Cek apakah sudah dinilai
            if (submission.grade !== null && submission.grade !== "") {
                return { 
                    statusCode: 403, 
                    body: JSON.stringify({ message: "Gagal: Tugas sudah dinilai oleh dosen." }) 
                };
            }

            // Aturan 2: Cek apakah sudah melewati deadline
            const taskInfo = await db.collection('tasks').findOne({ title: submission.taskTitle });
            if (taskInfo && taskInfo.deadline) {
                const isPastDeadline = new Date() > new Date(taskInfo.deadline);
                if (isPastDeadline) {
                    return { 
                        statusCode: 403, 
                        body: JSON.stringify({ message: "Gagal: Batas waktu hapus sudah berakhir (Melewati deadline)." }) 
                    };
                }
            }

            await db.collection('assignments').deleteOne({ _id: new ObjectId(submissionId) });

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Pengumpulan berhasil dihapus." })
            };
        }

        return { statusCode: 405, body: "Method Not Allowed" };

    } catch (error) {
        console.error("Error:", error);
        return { statusCode: 500, body: JSON.stringify({ message: "Terjadi kesalahan server." }) };
    } finally {
        await client.close();
    }
};