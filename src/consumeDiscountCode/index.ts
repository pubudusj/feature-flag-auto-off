import { EventBridge } from "aws-sdk";

export const handler = async (event: any = {}): Promise<any> => {
  const eventBusName = process.env.EVENT_BUS;
  const eventSource = process.env.EVENT_SOURCE || '';
  const eventName = process.env.EVENT_NAME || '';
  const discountCode = process.env.DISCOUNT_CODE;

  if (event.rawPath != '/') {
    return 'Path does not exists.';
  }

  // Publish to EventBridge.
  const publishMessage = await publish<any>(
    eventSource,
    eventName,
    {
      'pk': 'DiscountCode_' + discountCode
    },
    eventBusName
  );
  console.log(publishMessage);

  return 'Discount code ' + discountCode + ' consumed.';
};

export const publish = async <TEvent>(
  source: string,
  detailType: string,
  detail: TEvent,
  eventBusName: string = "default"
) => {
  const eventBus = new EventBridge();
  const res = await eventBus
    .putEvents({
      Entries: [
        {
          EventBusName: eventBusName,
          Source: source,
          DetailType: detailType,
          Detail: typeof detail === "string" ? detail : JSON.stringify(detail),
        },
      ],
    })
    .promise();
  const errors: string[] = [];
  res.Entries?.forEach((entry: any) => {
    if (entry.ErrorMessage) {
      errors.push(entry.ErrorMessage);
      return;
    }
  });
  console.log(errors);
  if (errors.length > 0) {
    throw new Error(errors.join(", "));
  } else {
    return 'success';
  }
};