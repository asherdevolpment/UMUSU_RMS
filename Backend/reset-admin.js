require("dotenv").config();

const { initializeDatabase, pool, resetDefaultAdmin } = require("./db");

async function main() {
  await initializeDatabase();
  const user = await resetDefaultAdmin();

  console.log("Default admin account is ready:");
  console.log(`Email: ${user.email}`);
  console.log(`Password: ${process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123"}`);
}

main()
  .catch((error) => {
    console.error("Failed to reset default admin:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
