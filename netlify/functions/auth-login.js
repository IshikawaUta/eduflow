const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    // 1. Pastikan hanya metode POST yang diizinkan
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        const { email, password } = JSON.parse(event.body);

        await client.connect();
        const user = await client.db('eduflow').collection('users').findOne({ email });

        // 2. Validasi User dan Password
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return { 
                statusCode: 401, 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Email atau password salah." }) 
            };
        }

        // 3. Buat Token JWT
        // Menggunakan process.env.JWT_SECRET (Pastikan sudah disetel di Netlify)
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // 4. Kirim Respon Berhasil
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                token, 
                role: user.role, 
                name: user.name,
                message: "Login Berhasil" 
            })
        };

    } catch (e) {
        console.error("Login Error:", e);
        return { 
            statusCode: 500, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Terjadi kesalahan pada server." }) 
        };
    } finally { 
        await client.close(); 
    }
};