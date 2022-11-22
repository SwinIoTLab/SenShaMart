const ChainUtil = require('../chain-util');

class MetaDataTransaction {
  constructor() {
    this.id               = null; // if there is a problem in the metadata transaction, change null with ChainUtil.id();
    this.Signiture        = null;
    this.Name             = null;
    this.Geo              = [];
    this.IP_URL           = null;
    this.Topic_Token      = null;
    this.Permission       = null;
    this.RequestDetail    = null;
    this.OrgOwner         = null;
    this.DepOwner         = null;
    this.PrsnOwner        = null;
    this.MetaHash         = null;
    this.PaymentPerKbyte  = null;
    this.PaymentPerMinute = null;
    this.Protocol         = null;
    this.MessageAttributes= {};
    this.Interval         = null;
    this.FurtherDetails   = null;
    this.SSNmetadata      = null;
    
   // this.Geo = null;
   // this.Std = null;
   // this.name= null;
   // this.MetaHash= null;
  //  this.file=null; 
  }

  // update(senderWallet, Geo, URI, Name,Permission, OrgOwner, SSNmetadata) {
    
  //   this.Geo         = Geo;
  //   this.URI         = URI;
  //   this.Name        = Name;
  //   this.Permission  = Permission;
  //   this.OrgOwner    = OrgOwner;
  //   this.PrsnOwner   = senderWallet.publicKey;
  //   this.MetaHash    = ChainUtil.hash(SSNmetadata);
  //   this.SSNmetadata = SSNmetadata;

  //   MetaDatatransaction.signMetaDataTransaction(this, senderWallet);

  //   return this;
  // }

  static MetaDataTransactionWithIoT(senderWallet, Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, PaymentPerMinute, Protocol, MessageAttributes, Intrval, FurtherDetails, SSNmetadata) {
    const metaDataTransaction = new this();
    metaDataTransaction.id                  = ChainUtil.id();
    metaDataTransaction.Name                = Name;
    metaDataTransaction.Geo                 = Geo;
    metaDataTransaction.IP_URL              = IP_URL;
    metaDataTransaction.Topic_Token         = Topic_Token;
    metaDataTransaction.Permission          = Permission;
    metaDataTransaction.RequestDetail       = RequestDetail
    metaDataTransaction.OrgOwner            = OrgOwner;
    metaDataTransaction.DepOwner            = DepOwner;
    metaDataTransaction.PrsnOwner           = PrsnOwner;
    metaDataTransaction.PaymentPerKbyte     = PaymentPerKbyte ;
    metaDataTransaction.PaymentPerMinute    = PaymentPerMinute;
    metaDataTransaction.Protocol            = Protocol;
    metaDataTransaction.MessageAttributes   = MessageAttributes;
    metaDataTransaction.MessageAttributes['DeviceID']   = metaDataTransaction.id;
    metaDataTransaction.MessageAttributes['DeviceName'] = Name;
    metaDataTransaction.MessageAttributes['Sensors'] =[{"SensorName":"","Value":"" , "Unit":""}];
    metaDataTransaction.MessageAttributes['TimeStamp'] = "";
    metaDataTransaction.Interval            = Intrval;
    metaDataTransaction.FurtherDetails      = FurtherDetails;  
    metaDataTransaction.SSNmetadata         = SSNmetadata;
    metaDataTransaction.MetaHash            = ChainUtil.hash(SSNmetadata);
    MetaDataTransaction.signMetaDataTransaction(metaDataTransaction, senderWallet);
    return metaDataTransaction;
  } 


static newMetaDataTransaction(senderWallet,Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, PaymentPerMinute, Protocol, MessageAttributes, Interval, FurtherDetails, SSNmetadata){
  return MetaDataTransaction.MetaDataTransactionWithIoT(senderWallet, Name,Geo ,IP_URL , Topic_Token, Permission, RequestDetail, OrgOwner, DepOwner,PrsnOwner, PaymentPerKbyte, PaymentPerMinute, Protocol, MessageAttributes, Interval, FurtherDetails, SSNmetadata
  );

}

static signMetaDataTransaction (metaDataTransaction, senderWallet) {
metaDataTransaction.Signiture = {
    timestamp: Date.now(),
    address: senderWallet.publicKey,
    signature: senderWallet.sign(ChainUtil.hash(metaDataTransaction.SSNmetadata))
}
}

static verifyMetaDataTransaction(metaDataTransaction) {
  return ChainUtil.verifySignature(
    metaDataTransaction.Signiture.address,
    metaDataTransaction.Signiture.signature,
    ChainUtil.hash(metaDataTransaction.SSNmetadata)
  );
}

}
module.exports = MetaDataTransaction;
