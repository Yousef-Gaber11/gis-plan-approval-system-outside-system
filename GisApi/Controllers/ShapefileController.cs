using Microsoft.AspNetCore.Mvc;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using ProjNet.CoordinateSystems;
using ProjNet.CoordinateSystems.Transformations;
using ProjNet.IO.CoordinateSystems;
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

                    MathTransform? transform = null;
                    var prjPath = Path.ChangeExtension(shpFile, ".prj");
                    if (System.IO.File.Exists(prjPath))
                    {
                        var wkt = System.IO.File.ReadAllText(prjPath);
                        var srcCs = CoordinateSystemWktReader.Parse(wkt) as CoordinateSystem;
                        if (srcCs != null)
                        {
                            transform = new CoordinateTransformationFactory()
                                .CreateFromCoordinateSystems(srcCs, GeographicCoordinateSystem.WGS84)
                                .MathTransform;
                        }
                    }

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
                            if (geometry != null && transform != null)
                            {
                                geometry = geometry.Copy();
                                geometry.Apply(new MathTransformFilter(transform));
                                geometry.GeometryChanged();
                            }

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

    public class MathTransformFilter : ICoordinateSequenceFilter
    {
        private readonly MathTransform _t;
        public MathTransformFilter(MathTransform t) => _t = t;

        public bool Done => false;
        public bool GeometryChanged => true;

        public void Filter(CoordinateSequence seq, int i)
        {
            var p = _t.Transform(new[] { seq.GetX(i), seq.GetY(i) });
            seq.SetX(i, p[0]);
            seq.SetY(i, p[1]);
        }
    }
}