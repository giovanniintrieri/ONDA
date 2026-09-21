package it.onda.player;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.File;
import java.util.*;

/** One application-owned database; browser storage is never used for music. */
public final class LibraryStore extends SQLiteOpenHelper {
    private static LibraryStore instance;
    public static synchronized LibraryStore get(Context context) {
        if (instance == null) instance = new LibraryStore(context.getApplicationContext());
        return instance;
    }
    private LibraryStore(Context context) { super(context, "onda.db", null, 1); setWriteAheadLoggingEnabled(true); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE records (bucket TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(bucket,id))");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Migrazione del database non disponibile");
    }
    public synchronized JSONObject read(String bucket, String id) throws JSONException {
        try (Cursor c = getReadableDatabase().query("records", new String[]{"json"}, "bucket=? AND id=?", new String[]{bucket,id}, null,null,null)) {
            return c.moveToFirst() ? new JSONObject(c.getString(0)) : null;
        }
    }
    public synchronized JSONArray all(String bucket) throws JSONException {
        JSONArray result = new JSONArray();
        try (Cursor c = getReadableDatabase().query("records", new String[]{"json"}, "bucket=?", new String[]{bucket}, null,null,"rowid ASC")) {
            while (c.moveToNext()) result.put(new JSONObject(c.getString(0)));
        }
        return result;
    }
    public synchronized void put(String bucket, String id, JSONObject value) {
        ContentValues v = new ContentValues(); v.put("bucket",bucket);v.put("id",id);v.put("json",value.toString());
        if(getWritableDatabase().insertWithOnConflict("records",null,v,SQLiteDatabase.CONFLICT_REPLACE)<0)throw new IllegalStateException("Dati non salvati. Controlla lo spazio disponibile.");
    }
    public synchronized void delete(String bucket,String id) { getWritableDatabase().delete("records","bucket=? AND id=?",new String[]{bucket,id}); }
    public synchronized JSONObject library() throws JSONException { return new JSONObject().put("tracks",all("tracks")).put("playlists",all("playlists")); }
    public synchronized JSONObject requireTrack(String id) throws JSONException {
        JSONObject t=read("tracks",id);if(t==null) throw new IllegalArgumentException("Brano non disponibile");return t;
    }
    public synchronized JSONObject editTrack(JSONObject changes) throws JSONException {
        String id=changes.getString("id");JSONObject t=requireTrack(id);
        for(String field:new String[]{"title","artist","album","genre"}) if(changes.has(field)) t.put(field,changes.getString(field));
        if(changes.has("liked"))t.put("liked",changes.getBoolean("liked"));
        put("tracks",id,t);return t;
    }
    public synchronized void count(String id, boolean played) {
        try { JSONObject t=read("tracks",id);if(t==null)return;
            String field=played?"plays":"skips"; t.put(field,t.optInt(field)+1);
            if(played)t.put("lastPlayed",System.currentTimeMillis());put("tracks",id,t);
        } catch(JSONException e) { android.util.Log.e("Onda","Statistiche non salvate",e); }
    }
    /** One transaction moves every reference and combines statistics before deleting records. */
    public synchronized JSONObject mergeTracks(String keepId, Set<String> removed) throws JSONException {
        if(removed.isEmpty() || removed.contains(keepId)) throw new IllegalArgumentException("Selezione duplicati non valida");
        JSONObject keep=requireTrack(keepId);
        double min=keep.optDouble("duration",0), max=min;
        for(String id:removed) {
            JSONObject t=requireTrack(id);
            if(!DuplicateRules.matches(keep.optString("title"),keep.optString("artist"),keep.optDouble("duration",0),t.optString("title"),t.optString("artist"),t.optDouble("duration",0)))
                throw new IllegalArgumentException("I brani sono cambiati. Riapri la verifica dei duplicati.");
            min=Math.min(min,t.optDouble("duration"));max=Math.max(max,t.optDouble("duration"));
            keep.put("plays",keep.optLong("plays")+t.optLong("plays"));
            keep.put("skips",keep.optLong("skips")+t.optLong("skips"));
            keep.put("liked",keep.optBoolean("liked")||t.optBoolean("liked"));
            keep.put("lastPlayed",Math.max(keep.optLong("lastPlayed"),t.optLong("lastPlayed")));
            keep.put("addedAt",Math.min(keep.optLong("addedAt"),t.optLong("addedAt")));
        }
        if(max-min>2) throw new IllegalArgumentException("Le durate dei brani sono troppo diverse");
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            JSONArray playlists=all("playlists");
            for(int i=0;i<playlists.length();i++) {
                JSONObject p=playlists.getJSONObject(i);
                p.put("trackIds",replaceIds(p.getJSONArray("trackIds"),removed,keepId));put("playlists",p.getString("id"),p);
            }
            Object saved=setting("player");
            if(saved instanceof JSONObject) {
                JSONObject state=(JSONObject)saved;
                for(String field:new String[]{"queue","original"}) if(state.has(field)) state.put(field,replaceIds(state.getJSONArray(field),removed,keepId));
                if(removed.contains(state.optString("currentId"))) state.put("currentId",keepId);
                setting("player",state);
            }
            put("tracks",keepId,keep);
            for(String id:removed) delete("tracks",id);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return keep;
    }
    private static JSONArray replaceIds(JSONArray ids,Set<String> removed,String keep) throws JSONException {
        List<String> list=new ArrayList<>();for(int i=0;i<ids.length();i++) list.add(ids.getString(i));
        return new JSONArray(DuplicateRules.replace(list,removed,keep));
    }
    public synchronized void removeTrack(Context context,String id) throws JSONException {
        requireTrack(id);
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            JSONArray playlists=all("playlists");
            for(int i=0;i<playlists.length();i++) {
                JSONObject p=playlists.getJSONObject(i);JSONArray old=p.getJSONArray("trackIds"),ids=new JSONArray();
                for(int j=0;j<old.length();j++)if(!id.equals(old.getString(j)))ids.put(old.getString(j));
                p.put("trackIds",ids);put("playlists",p.getString("id"),p);
            }
            delete("tracks",id);db.setTransactionSuccessful();
        } finally {db.endTransaction();}
        mediaFile(context,id).delete();coverFile(context,id).delete();
    }
    public synchronized Object setting(String id) throws JSONException { JSONObject item=read("settings",id);return item==null?JSONObject.NULL:item.opt("value"); }
    public synchronized void setting(String id,Object value) throws JSONException {put("settings",id,new JSONObject().put("value",value));}
    private static void validId(String id) {if(!id.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Identificativo brano non valido");}
    public static File mediaFile(Context context,String id) {validId(id);File dir=new File(context.getFilesDir(),"music");dir.mkdirs();return new File(dir,id);}
    public static File coverFile(Context context,String id) {validId(id);File dir=new File(context.getFilesDir(),"covers");dir.mkdirs();return new File(dir,id+".jpg");}
}
