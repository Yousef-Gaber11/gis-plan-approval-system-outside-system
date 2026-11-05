using Microsoft.AspNetCore.Mvc;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using System.IO.Compression;

namespace GisApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ShapefileController : ControllerBase
    {
        [HttpPost("parse")]
        public async Task<IActionResult> ParseShapefile(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file uploaded.");

            if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                return BadRequest("Only .zip files are supported.");

            var tempFolder = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
            Directory.CreateDirectory(tempFolder);

            try
            {
                var zipPath = Path.Combine(tempFolder, Path.GetFileName(file.FileName));
                using (var stream = new FileStream(zipPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                ZipFile.ExtractToDirectory(zipPath, tempFolder);

                var shpFiles = Directory.GetFiles(tempFolder, "*.shp", SearchOption.AllDirectories);
                if (shpFiles.Length == 0)
                    return BadRequest("No shapefiles found in the zip.");

                var layers = new List<object>();

                foreach (var shpFile in shpFiles)
                {
                    var layerName = Path.GetFileNameWithoutExtension(shpFile);
                    var geoJsonFeatures = new List<object>();

                    var prjPath = Path.ChangeExtension(shpFile, ".prj");
                    string? prjText = System.IO.File.Exists(prjPath)
                        ? System.IO.File.ReadAllText(prjPath)
                        : null;

                    using (var reader = new ShapefileDataReader(shpFile, GeometryFactory.Default))
                    {
                        var header = reader.DbaseHeader;

                        while (reader.Read())
                        {
                            var properties = new Dictionary<string, object?>();

                            for (int i = 0; i < header.NumFields; i++)
                            {
                                var val = reader.GetValue(i + 1);


                                if (val == null || val is DBNull)
                                {
                                    val = string.Empty;
                                }
                                else if (val is double d && !double.IsFinite(d))
                                {
                                    val = 0;
                                }
                                else if (val is float f && !float.IsFinite(f))
                                {
                                    val = 0;
                                }

                                properties[header.Fields[i].Name] = val;
                            }

                            var geometry = reader.Geometry;

                            geoJsonFeatures.Add(new Dictionary<string, object?>
                            {
                                ["type"] = "Feature",
                                ["properties"] = properties,
                                ["geometry"] = geometry
                            });
                        }
                    }

                    layers.Add(new
                    {
                        fileName = layerName,
                        type = "FeatureCollection",
                        prj = prjText,
                        features = geoJsonFeatures
                    });
                }

                return Ok(layers);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error processing shapefile: {ex.Message}");
            }
            finally
            {
                if (Directory.Exists(tempFolder))
                    Directory.Delete(tempFolder, true);
            }
        }
    }
}