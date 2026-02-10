const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    // Standard Headers
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    };

    // 1. Hanya izinkan metode POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: "Method Not Allowed" };
    }

    // 2. Verifikasi Token JWT
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { 
            statusCode: 401, 
            headers,
            body: JSON.stringify({ message: "Sesi tidak ditemukan." }) 
        };
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY_ANDA");
        
        // Proteksi Role: Pastikan yang mengakses adalah admin/dosen
        if (decoded.role !== 'admin') {
            return { 
                statusCode: 403, 
                headers,
                body: JSON.stringify({ message: "Akses ditolak. Fitur ini khusus Dosen." }) 
            };
        }
    } catch (err) {
        return { 
            statusCode: 401, 
            headers,
            body: JSON.stringify({ message: "Token kadaluarsa, silakan login kembali." }) 
        };
    }

    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        const data = JSON.parse(event.body || "{}");
        const { taskId, grade, feedback } = data;

        if (!taskId) {
            return { 
                statusCode: 400, 
                headers,
                body: JSON.stringify({ message: "ID Tugas diperlukan." }) 
            };
        }

        await client.connect();
        const collection = client.db('eduflow').collection('assignments');

        // 3. Eksekusi Update Nilai
        // Kita pastikan grade adalah angka jika ada isinya, jika kosong simpan null
        const numericGrade = (grade !== "" && grade !== null) ? Number(grade) : null;

        const result = await collection.updateOne(
            { _id: new ObjectId(taskId) },
            { 
                $set: { 
                    grade: numericGrade, 
                    feedback: feedback || "",
                    gradedAt: new Date(),
                    lastModifiedBy: decoded.email // Mengambil email dosen dari Token
                } 
            }
        );

        if (result.matchedCount === 0) {
            return { 
                statusCode: 404, 
                headers,
                body: JSON.stringify({ message: "Data pengumpulan tidak ditemukan." }) 
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                message: "Nilai dan feedback berhasil disimpan.",
                status: numericGrade !== null ? "Sudah Dinilai" : "Menunggu Nilai"
            })
        };

    } catch (error) {
        console.error("Update Grade Error:", error);
        return { 
            statusCode: 500, 
            headers,
            body: JSON.stringify({ message: "Terjadi kesalahan server.", error: error.toString() }) 
        };
    } finally {
        await client.close();
    }
};