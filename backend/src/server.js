// Entry point solo per esecuzione locale
const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server in esecuzione su porta ${PORT}`);
    console.log(`Portfolio API pronta su http://localhost:${PORT}/api`);
});
