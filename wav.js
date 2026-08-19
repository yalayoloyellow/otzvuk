// WAV-кодирование 16 бит. Общее для записи и для выгрузки тем на анализ,
// чтобы формат не разъезжался между двумя местами.
export function encodeWav(chans,n,sr){
  const ch=chans.length, buf=new ArrayBuffer(44+n*2*ch), v=new DataView(buf);
  const str=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  str(0,'RIFF'); v.setUint32(4,36+n*2*ch,true); str(8,'WAVEfmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,ch,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2*ch,true);
  v.setUint16(32,2*ch,true); v.setUint16(34,16,true);
  str(36,'data'); v.setUint32(40,n*2*ch,true);
  let o=44;
  for(let i=0;i<n;i++) for(let c=0;c<ch;c++){
    let x=chans[c][i]; x=x<-1?-1:x>1?1:x;
    v.setInt16(o,x*32767,true); o+=2;
  }
  return new Blob([buf],{type:'audio/wav'});
}
