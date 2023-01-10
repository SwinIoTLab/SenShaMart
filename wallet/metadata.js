const ChainUtil = require('../chain-util');

class Metadata {
  constructor() {
    this.id = null;
    this.Signiture        = null;
   // this.Name             = null;
   // this.Geo              = null;

   // this.GeospatialLocation              = [];
  //  this.Owenership = null;
  //  this.Cost = null;
  //  this.Identifications = null;
  //  this.Integration = null;

   // this.IP_URL           = null;
  //  this.Topic_Token      = null;
    // this.Permission       = null;
    // this.RequestDetail    = null;
    // this.OrgOwner         = null;
    // this.DepOwner         = null;
    // this.PrsnOwner        = null;
    // this.MetaHash         = null;
    // this.PaymentPerKbyte  = null;
    // this.PaymentPerMinute = null;
    // this.Protocol         = null;
    // this.MessageAttributes= {};
    // this.Interval         = null;
    // this.FurtherDetails   = null;
    this.SSNmetadata      = null;
  }

  static MetadataOfIoTDevice(senderWallet, SSNmetadata) {
    const metadata = new this();
    metadata.id                  = ChainUtil.id();
    // metadata.Name                = Name;
    // metadata.Geo                 = Geo;
    // metadata.IP_URL              = IP_URL;
    // metadata.Topic_Token         = Topic_Token;
    // metadata.Permission          = Permission;
    // metadata.RequestDetail       = RequestDetail
    // metadata.OrgOwner            = OrgOwner;
    // metadata.DepOwner            = DepOwner;
    // metadata.PrsnOwner           = PrsnOwner;
    // metadata.PaymentPerKbyte     = PaymentPerKbyte ;
    // metadata.PaymentPerMinute    = PaymentPerMinute;
    // metadata.Protocol            = Protocol;
    // metadata.MessageAttributes   = MessageAttributes;


   // metadata.MessageAttributes['DeviceID']   = metadata.id;
   // metadata.MessageAttributes['DeviceName'] = Name;
   // metadata.MessageAttributes['Sensors'] =[{"SensorName":"","Value":"" , "Unit":""}];
   // metadata.MessageAttributes['TimeStamp'] = "";


    // metadata.Interval            = Intrval;
    // metadata.FurtherDetails      = FurtherDetails;  
    metadata.SSNmetadata         = SSNmetadata;
    metadata.MetaHash            = ChainUtil.hash(SSNmetadata);
    Metadata.signMetadata(metadata, senderWallet);
    return metadata;
  }

  static newMetadata(senderWallet,SSNmetadata){
    return Metadata.MetadataOfIoTDevice(senderWallet, SSNmetadata);
  }

  static signMetadata (metadata, senderWallet) {
    metadata.Signiture = {
        timestamp: Date.now(),
        address: senderWallet.publicKey,
        signature: senderWallet.sign(ChainUtil.hash(metadata.SSNmetadata))
    }
    }

  static verifyMetadata(metadata) {
    return ChainUtil.verifySignature(
      metadata.Signiture.address,
      metadata.Signiture.signature,
      ChainUtil.hash(metadata.SSNmetadata)
    );
  }
}

module.exports = Metadata;