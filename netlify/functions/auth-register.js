const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

exports.handler = async (event) => {
    // 1. Hanya izinkan metode POST
    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Method Not Allowed" }) 
        };
    }

    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        const { name, email, password } = JSON.parse(event.body);

        // 2. Validasi Input Dasar
        if (!name || !email || !password) {
            return { 
                statusCode: 400, 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Semua kolom wajib diisi." }) 
            };
        }

        // Validasi format email sederhana
        if (!email.includes('@')) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ message: "Format email tidak valid." }) 
            };
        }

        await client.connect();
        const collection = client.db('eduflow').collection('users');

        // 3. Cek Duplikasi Email
        const existingUser = await collection.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return { 
                statusCode: 400, 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Email ini sudah digunakan." }) 
            };
        }

        // 4. Hash Password & Simpan
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: "student", // Otomatis menjadi mahasiswa
            createdAt: new Date()
        };

        await collection.insertOne(newUser);

        return { 
            statusCode: 201, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Registrasi berhasil! Silakan login." }) 
        };

    } catch (e) {
        console.error("Register Error:", e);
        return { 
            statusCode: 500, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Gagal memproses pendaftaran." }) 
        };
    } finally { 
        await client.close(); 
    }
};