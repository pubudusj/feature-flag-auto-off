import axios from 'axios';

export const handler = async (event: any = {}): Promise<any> => {
  if (event.rawPath != '/') {
    return 'Path does not exists.';
  }

  const applicationId = process.env.APPCONFIG_APPLICATION_ID;
  const environment = process.env.APPCONFIG_ENVIRONMENT;
  const configurationId = process.env.APPCONFIG_CONFIGURATION_ID;

  const url = 'http://localhost:2772/applications/' + applicationId + '/environments/' + environment + '/configurations/' + configurationId + '?flag=discountCodeEnabled';

  try {
    const { data, status } = await axios.get(url);
    console.log(data, status);

    return data;
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
