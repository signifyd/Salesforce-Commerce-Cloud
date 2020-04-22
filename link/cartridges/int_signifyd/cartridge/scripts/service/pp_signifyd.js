/**
* Demandware Script File
* To define input and output parameters, create entries of the form:
*
* @<paramUsageType> <paramName> : <paramDataType> [<paramComment>]
*
* where
*   <paramUsageType> can be either 'input' or 'output'
*   <paramName> can be any valid parameter name
*   <paramDataType> identifies the type of the parameter
*   <paramComment> is an optional comment
*
* For example:
*
* @input Order: dw.order.Order
*
*/
importPackage(dw.system);
var Signifyd = require("./signifyd");

function execute(args) 
{
    var order = args.Order;
    var result = Signifyd.Call(order);
    if(result){
        return PIPELET_NEXT;
    } else {
        return PIPELET_ERROR;
    }
}
