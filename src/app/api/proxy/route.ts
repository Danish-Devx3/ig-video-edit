export default async function handler(req, res) {
  const { url } = req.query;

  try {
    const response = await fetch(url);
    response.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
}
