// Entry point solo per esecuzione locale
const app = require('./app');
const { env } = require('./config/env');

const PORT = env.port;

app.listen(PORT, () => {
    console.log(`Server in esecuzione su porta ${PORT}`);
    console.log(`Portfolio API pronta su http://localhost:${PORT}/api`);
});
