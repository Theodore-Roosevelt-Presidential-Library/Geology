# Build data/geology.topo.json and data/coverage.geojson from the NPS GRI geodatabase (thro_geology.gdb).
# Usage: python3 scripts/build_geology.py path/to/thro_geology.gdb data path/to/node_modules/.bin
import pyogrio, geopandas as gpd, json, sys, os, subprocess
from shapely.geometry import Point
src,out,topo=sys.argv[1],sys.argv[2],sys.argv[3]
os.makedirs(out,exist_ok=True); import tempfile; tmp=tempfile.mkdtemp(); os.makedirs(tmp,exist_ok=True)
def w(df,name):
    pyogrio.write_dataframe(df,f'{tmp}/{name}.geojson',driver='GeoJSON',layer_options={'COORDINATE_PRECISION':6,'RFC7946':'YES'})
g=pyogrio.read_dataframe(src,layer='throglg')[['GLG_SYM','geometry']]
g['geometry']=g.geometry.simplify(5,preserve_topology=True); g=g[~g.geometry.is_empty]
w(g.to_crs(4326).rename(columns={'GLG_SYM':'u'}),'units')
b=pyogrio.read_dataframe(src,layer='throgln')[['GLG_SYM','geometry']]
b['geometry']=b.geometry.simplify(4); w(b.to_crs(4326).rename(columns={'GLG_SYM':'u'}),'beds')
s=pyogrio.read_dataframe(src,layer='throsil')[['GLG_SYM','geometry']]
s['geometry']=s.geometry.simplify(3); w(s.to_crs(4326).rename(columns={'GLG_SYM':'u'}),'silcrete')
e=pyogrio.read_dataframe(src,layer='throgle')[['GLG_SYM','geometry']]
e['geometry']=e.geometry.simplify(3); w(e.to_crs(4326).rename(columns={'GLG_SYM':'u'}),'erratics')
subprocess.run(f'{topo}/geo2topo -q 1e5 units={tmp}/units.geojson beds={tmp}/beds.geojson silcrete={tmp}/silcrete.geojson erratics={tmp}/erratics.geojson > {out}/geology.topo.json',shell=True,check=True)
cov=gpd.GeoSeries([g.union_all().buffer(25).buffer(-25)],crs=g.crs).simplify(30).to_crs(4326)
gpd.GeoDataFrame(geometry=cov).to_file(f'{out}/coverage.geojson',driver='GeoJSON',COORDINATE_PRECISION=5)
