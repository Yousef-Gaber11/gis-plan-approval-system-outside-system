export async function shapefileApi(file) {
  const formData = new FormData();
  formData.append("file", file);

  const apiUrl = "https://localhost:7232/api/shapefile/parse";
  const response = await fetch(apiUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`خطأ من السيرفر: ${response.statusText}`);
  }

  const result = await response.json();
  return Array.isArray(result) ? result : [result];
}
