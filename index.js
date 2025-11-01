import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LOGIN_URL = "https://service.talkfirst.vn/v1/api/account/student/login";
const REGISTER_URL = "https://service.talkfirst.vn/v1/api/student/lesson/register";

const CRON_USER = "";
const CRON_PASS = "";

const LESSON_IDS = [
    "4e2d6776-a8d4-4a63-b68c-191781e324ce", // Communicate 1
    "03a768ff-04b4-4eca-a76f-0b941bd947e2", // Communicate 2
    "c2dac675-3a1c-4873-be55-efa967c23430", // Free Talk
    "2255de13-81a3-4097-bd35-009c9e541309", // Skill
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
