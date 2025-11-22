import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LOGIN_URL = "https://service.talkfirst.vn/v1/api/account/student/login";
const REGISTER_URL = "https://service.talkfirst.vn/v1/api/student/lesson/register";

const CRON_USER = process.env.CRON_USER;
const CRON_PASS = process.env.CRON_PASS;

const LESSON_IDS = [
    "105ef6e7-6ef6-4239-9e6d-2b35274085d5", // Communicate 1
    "a1e11854-2575-4548-9c4a-1c814c6c1689", // Communicate 2
	"5864242b-7fd7-4b05-9cc2-b6615625a48b", // Communicate 3
    "55a4f376-2a94-437c-87fc-24c1daefc678", // Free Talk
    "97a67a8e-0160-4b2a-9333-5515d756ec1c", // Skill
];

async function retryRequest(fn, retries = 3, delay = 2000) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            if (i > 0) console.log(`Retry ${i + 1}/${retries}...`);
            return await fn();
        } catch (err) {
            lastError = err;
            const shouldRetry =
                !err.response || (err.response.status >= 500 && err.response.status < 600);

            if (!shouldRetry) throw err;

            console.warn(
                `Error ${i + 1}: ${err.message || err.response?.data?.message}`
            );
            if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastError;
}

app.get("/run-all", async (req, res) => {
    try {
        const { data: loginData } = await axios.post(LOGIN_URL, {
            username: CRON_USER,
            password: CRON_PASS,
        });

        const token = loginData.data?.token;
        if (!token) throw new Error("Cannot obtain auth token");

        console.log("Login successful. Token obtained.");

        const results = [];

        for (const id of LESSON_IDS) {
            try {
                const { data } = await retryRequest(
                    () =>
                        axios.post(
                            REGISTER_URL,
                            { lessonId: id },
                            {
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    "Content-Type": "application/json",
                                    Origin: "https://student.talkfirst.vn",
                                    Referer: "https://student.talkfirst.vn/",
                                },
                                timeout: 10000,
                            }
                        ),
                    3,
                    2000
                );

                console.log(`Success: ${id}`);
                results.push({ lessonId: id, status: "OK", data });
            } catch (err) {
                const errorMsg = err.response?.data || err.message;
                console.error(`Failed: ${id}`, errorMsg);

                results.push({
                    lessonId: id,
                    status: "FAIL",
                    error: errorMsg,
                });
            }
        }

        res.json({
            success: true,
            message: "Done",
            results,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}/run-all`);
});
