import axios from 'axios';

export const handler = async (event: any = {}): Promise<any> => {
  if (event.rawPath != '/') {
    return 'Path does not exists.';
  }

  const applicationId = process.env.APPCONFIG_APPLICATION_ID;
  const environment = process.env.APPCONFIG_ENVIRONMENT;
  const configurationId = process.env.APPCONFIG_CONFIGURATION_ID;
  const discountCode = process.env.DISCOUNT_CODE;

  const url = 'http://localhost:2772/applications/' + applicationId + '/environments/' + environment + '/configurations/' + configurationId + '?flag=discountCodeEnabled';

  try {
    const { data, status } = await axios.get(url);

    let content = '<html><h2>Sorry, discount code ' + discountCode + ' not available.</h2></html>';

    if (data.enabled == true) {
      content = '<html><h2>Yay!!! Discount code ' + discountCode + ' available.</h2><br /><iframe src="https://giphy.com/embed/CC12bXfpwxyz5kRkmn" width="480" height="326" frameBorder="0" class="giphy-embed" allowFullScreen></iframe><p><a href="https://giphy.com/gifs/couponmoto-discount-online-shopping-deals-CC12bXfpwxyz5kRkmn">via GIPHY</a></p></html>';
    }

    return {
      "statusCode": 200,
      "body": content,
      "headers": {
        'Content-Type': 'text/html',
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log('error message: ', error.message);
      return error.message;
    } else {
      console.log('unexpected error: ', error);
      return 'An unexpected error occurred';
    }
  }
};
