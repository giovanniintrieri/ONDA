package it.onda.player;
import java.util.*;
/** Independent of Android so repeat/shuffle rules can be tested on the JVM. */
public final class QueueOrder {
    private QueueOrder(){}
    public static List<String> unique(List<String> ids){return new ArrayList<>(new LinkedHashSet<>(ids));}
    public static List<String> shuffled(List<String> ids,String first,Random random){
        List<String> result=unique(ids);Collections.shuffle(result,random);
        if(first!=null&&result.remove(first))result.add(0,first);return result;
    }
    public static List<String> nextCycle(List<String> ids,String last,Random random){
        List<String> result=shuffled(ids,null,random);
        if(result.size()>1&&result.get(0).equals(last))Collections.swap(result,0,1+random.nextInt(result.size()-1));return result;
    }
}
