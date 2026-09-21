package it.onda.player;
import java.util.*;

public final class LibraryRulesCheck {
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    public static void main(String[] args) {
        long now=1_800_000_000_000L;
        List<String> ids=Arrays.asList("a","b","c","d","e","f","a");
        Map<String,QueueOrder.Details> data=new HashMap<>();
        for(String id:ids)data.put(id,new QueueOrder.Details("artist-"+((id.charAt(0)-'a')/2),0));
        for(int seed=0;seed<200;seed++) {
            List<String> order=QueueOrder.smart(ids,"c",null,data,new Random(seed),now);
            check(order.get(0).equals("c"),"Selected song must stay first");
            check(order.size()==6&&new HashSet<>(order).equals(new HashSet<>(ids)),"Every song exactly once");
            for(int i=1;i<order.size();i++) {
                String previousArtist=data.get(order.get(i-1)).artist;
                if(data.get(order.get(i)).artist.equals(previousArtist)) {
                    for(int j=i+1;j<order.size();j++)check(data.get(order.get(j)).artist.equals(previousArtist),"Separate artists whenever an alternative exists");
                }
            }
            order=QueueOrder.smart(ids,null,"f",data,new Random(seed),now);
            check(!order.get(0).equals("f"),"No repeat at cycle boundary");
            check(new HashSet<>(order).size()==6,"No lost songs at boundary");
        }
        Map<String,QueueOrder.Details> recent=new HashMap<>();
        recent.put("recent",new QueueOrder.Details("same",now));
        recent.put("fresh",new QueueOrder.Details("same",0));
        int freshFirst=0;
        for(int seed=0;seed<1000;seed++)if(QueueOrder.smart(Arrays.asList("recent","fresh"),null,null,recent,new Random(seed),now).get(0).equals("fresh"))freshFirst++;
        check(freshFirst>750,"Recently played songs should be less likely to lead");
        check(QueueOrder.smart(Collections.emptyList(),null,null,data,new Random(1),now).isEmpty(),"Empty queue");
        check(QueueOrder.smart(Arrays.asList("a","a"),null,"a",data,new Random(1),now).equals(Arrays.asList("a")),"Single-song queue");
        check(DuplicateRules.matches("  Song ","ARTIST",180,"song"," artist ",182),"Normalized duplicates");
        check(!DuplicateRules.matches("Song","Artist",180,"Song (Live)","Artist",180),"Live version distinct");
        check(!DuplicateRules.matches("Song","Artista sconosciuto",180,"Song","Artista sconosciuto",180),"Unknown artist excluded");
        check(!DuplicateRules.matches("Song","Artist",0,"Song","Artist",0),"Unknown duration excluded");
        check(DuplicateRules.replace(Arrays.asList("a","b","c","a","d"),new HashSet<>(Arrays.asList("a","c")),"b").equals(Arrays.asList("b","d")),"Merge references once, preserving order");
        System.out.println("Library rules passed");
    }
}
